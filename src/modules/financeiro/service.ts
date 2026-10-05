// Transações das cobranças manuais (FIN-01, #86). Sem `server-only`, para a integração exercitar
// exatamente estas transações; as actions só autorizam, validam, revalidam e redirecionam.
//
// - Criar: a chave da operação (idempotencyKey, gerada quando o formulário abre) é única no banco.
//   Reenvio com o mesmo conteúdo devolve a cobrança já criada; com conteúdo diferente é recusado e
//   o original fica intacto. Reenvios simultâneos: um grava, os outros caem na chave única e relêem.
// - Cancelar: trava a linha (FOR UPDATE), relê o estado e só cancela cobrança ATIVA sem pagamento
//   válido. Repetir o cancelamento não muda nada (nem data, nem autor, nem motivo).
// - Substituir: na mesma transação, cancela a original (com motivo) e lança a substituta ligada a
//   ela. Duas substituições simultâneas da mesma original: só a primeira vale.
// Autoria vem sempre da sessão (actorId), nunca do formulário. Não há edição nem exclusão física
// (trigger "Charge_immutable" no banco).
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { ChargeData } from "./validation";

type Db = Pick<PrismaClient, "$transaction" | "charge">;
type Tx = Prisma.TransactionClient;

export const CHARGE_NOT_FOUND = "Cobrança não encontrada.";
export const PATIENT_NOT_FOUND = "Paciente não encontrado. Selecione outro paciente.";
export const KEY_MISMATCH =
  "Esta operação já foi registrada com outros dados e não foi alterada. Recarregue o formulário para lançar uma nova cobrança.";
export const ALREADY_CANCELLED = "Esta cobrança já está cancelada. A substituição não foi registrada.";
export const HAS_VALID_PAYMENTS =
  "Esta cobrança tem pagamento válido e não pode ser cancelada. Estorne o pagamento antes.";

export class ChargeRuleError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "ChargeRuleError";
  }
}

export type ChargeResult = { id: string; created: boolean };

// Ponto de teste: a integração simula um pagamento válido para provar que a checagem roda dentro da
// transação, sob a trava, e impede o cancelamento sem efeito colateral.
type PaymentsCheck = (tx: Tx, chargeId: string) => Promise<boolean>;
export type ChargeHooks = { hasValidPayments?: PaymentsCheck };

// Contrato para a FIN-02 (#87): cancelar exige ausência de pagamento válido (não estornado),
// conferida dentro da transação e sob a trava da cobrança. Nesta fatia não existem pagamentos;
// a FIN-02 troca este corpo pela consulta dos pagamentos não estornados, sem mudar os chamadores.
export const hasValidPayments: PaymentsCheck = async () => false;

type Existing = {
  id: string;
  patientId: string;
  description: string;
  amountCents: number;
  dueDate: Date;
  replacesChargeId: string | null;
};

const EXISTING_SELECT = {
  id: true,
  patientId: true,
  description: true,
  amountCents: true,
  dueDate: true,
  replacesChargeId: true,
} as const;

// Mesma chave: só devolve o registro se o conteúdo for o mesmo do reenvio.
function reuse(existing: Existing, data: ChargeData, replacesChargeId: string | null): ChargeResult {
  const same =
    existing.patientId === data.patientId &&
    existing.description === data.description &&
    existing.amountCents === data.amountCents &&
    existing.dueDate.getTime() === data.dueDate.getTime() &&
    existing.replacesChargeId === replacesChargeId;
  if (!same) throw new ChargeRuleError(KEY_MISMATCH);
  return { id: existing.id, created: false };
}

function isUniqueViolation(error: unknown, field: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  return JSON.stringify(error.meta ?? {}).includes(field);
}

async function byKey(db: Pick<Tx, "charge">, key: string) {
  return db.charge.findUnique({ where: { idempotencyKey: key }, select: EXISTING_SELECT });
}

// Qualquer paciente cadastrado, ativo ou inativo: a inativação não impede regularizar cobranças.
async function assertPatientExists(tx: Tx, patientId: string) {
  const patient = await tx.patient.findUnique({ where: { id: patientId }, select: { id: true } });
  if (!patient) throw new ChargeRuleError(PATIENT_NOT_FOUND, "patientId");
}

async function lockCharge(tx: Tx, chargeId: string) {
  const [row] = await tx.$queryRaw<{ id: string; status: "ATIVA" | "CANCELADA" }[]>`
    SELECT "id", "status"::text AS "status" FROM "Charge" WHERE "id" = ${chargeId} FOR UPDATE`;
  if (!row) throw new ChargeRuleError(CHARGE_NOT_FOUND);
  return row;
}

// Reenvio cuja transação perdeu a corrida pela chave: relê o registro confirmado.
async function afterKeyConflict(db: Db, key: string, data: ChargeData, replacesChargeId: string | null) {
  const existing = await byKey(db, key);
  if (!existing) throw new ChargeRuleError(KEY_MISMATCH);
  return reuse(existing, data, replacesChargeId);
}

export async function createCharge(
  db: Db,
  actorId: string,
  input: ChargeData & { requestId: string },
): Promise<ChargeResult> {
  const { requestId, ...data } = input;
  try {
    return await db.$transaction(async (tx) => {
      const existing = await byKey(tx, requestId);
      if (existing) return reuse(existing, data, null);
      await assertPatientExists(tx, data.patientId);
      const created = await tx.charge.create({
        data: { ...data, idempotencyKey: requestId, createdById: actorId },
        select: { id: true },
      });
      return { id: created.id, created: true };
    });
  } catch (error) {
    if (isUniqueViolation(error, "idempotencyKey")) return afterKeyConflict(db, requestId, data, null);
    throw error;
  }
}

export async function cancelCharge(
  db: Db,
  actorId: string,
  input: { chargeId: string; reason: string },
  hooks: ChargeHooks = {},
): Promise<{ alreadyCancelled: boolean }> {
  const paymentsCheck = hooks.hasValidPayments ?? hasValidPayments;
  return db.$transaction(async (tx) => {
    const current = await lockCharge(tx, input.chargeId);
    // Repetição (duplo clique, outra aba): nada muda, o primeiro cancelamento é preservado.
    if (current.status === "CANCELADA") return { alreadyCancelled: true };
    if (await paymentsCheck(tx, input.chargeId)) throw new ChargeRuleError(HAS_VALID_PAYMENTS);
    await tx.charge.update({
      where: { id: input.chargeId },
      data: { status: "CANCELADA", cancelledAt: new Date(), cancelledById: actorId, cancelReason: input.reason },
      select: { id: true },
    });
    return { alreadyCancelled: false };
  });
}

export async function replaceCharge(
  db: Db,
  actorId: string,
  input: ChargeData & { chargeId: string; reason: string; requestId: string },
  hooks: ChargeHooks = {},
): Promise<ChargeResult> {
  const { chargeId, reason, requestId, ...data } = input;
  const paymentsCheck = hooks.hasValidPayments ?? hasValidPayments;
  try {
    return await db.$transaction(async (tx) => {
      const original = await lockCharge(tx, chargeId);
      // Depois da trava: um reenvio da mesma substituição encontra a que já foi confirmada.
      const existing = await byKey(tx, requestId);
      if (existing) return reuse(existing, data, chargeId);
      if (original.status === "CANCELADA") throw new ChargeRuleError(ALREADY_CANCELLED);
      if (await paymentsCheck(tx, chargeId)) throw new ChargeRuleError(HAS_VALID_PAYMENTS);
      await assertPatientExists(tx, data.patientId);
      await tx.charge.update({
        where: { id: chargeId },
        data: { status: "CANCELADA", cancelledAt: new Date(), cancelledById: actorId, cancelReason: reason },
        select: { id: true },
      });
      const created = await tx.charge.create({
        data: { ...data, idempotencyKey: requestId, replacesChargeId: chargeId, createdById: actorId },
        select: { id: true },
      });
      return { id: created.id, created: true };
    });
  } catch (error) {
    if (isUniqueViolation(error, "idempotencyKey")) return afterKeyConflict(db, requestId, data, chargeId);
    // Última barreira (a trava já serializa): outra substituição confirmada para a mesma original.
    if (isUniqueViolation(error, "replacesChargeId")) throw new ChargeRuleError(ALREADY_CANCELLED);
    throw error;
  }
}
