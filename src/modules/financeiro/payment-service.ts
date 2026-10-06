// Pagamentos e estornos (FIN-02, #87). Sem server-only: a integração executa os mesmos serviços
// usados pelas actions. Cada escritor trava a Charge em READ COMMITTED e só depois consulta saldo.
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { z } from "zod";
import { isPlausibleId, toDateInput } from "./validation";
import { PAYMENT_MESSAGES, paymentDataSchemas, type CreatePaymentInput, type ReplacePaymentInput, type ReversePaymentInput } from "./payment-validation";

type Db = Pick<PrismaClient, "$transaction" | "payment" | "paymentReversal">;
type Tx = Prisma.TransactionClient;
type Clock = { now?: Date };
type Existing = { id: string; fingerprint: string };
type Operation = "RECEBIMENTO" | "ESTORNO" | "CORRECAO";
const EXISTING_SELECT = { id: true, fingerprint: true } as const;
const ORIGINAL_SELECT = {
  id: true,
  chargeId: true,
  amountCents: true,
  receivedOn: true,
  reversal: { select: { id: true } },
  replacedBy: { select: { id: true } },
} as const;

export const PAYMENT_NOT_FOUND = PAYMENT_MESSAGES.paymentNotFound;
export const PAYMENT_KEY_MISMATCH = PAYMENT_MESSAGES.keyMismatch;
export const PAYMENT_EXCEEDS_BALANCE = PAYMENT_MESSAGES.exceedsBalance;
export const CHARGE_CANCELLED = PAYMENT_MESSAGES.chargeCancelled;
export const PAYMENT_ALREADY_REVERSED = PAYMENT_MESSAGES.alreadyReversed;
export const PAYMENT_NOT_REVERSED = PAYMENT_MESSAGES.notReversed;
export const PAYMENT_ALREADY_REPLACED = PAYMENT_MESSAGES.alreadyReplaced;
export const PAYMENT_DIFFERENT_CHARGE = PAYMENT_MESSAGES.differentCharge;

export class PaymentRuleError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "PaymentRuleError";
  }
}

export type PaymentResult = { id: string; created: boolean };
export type ReversalResult = { id: string; alreadyReversed: boolean };

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue.path[0] === "amountCents" ? "amount" : typeof issue.path[0] === "string" ? issue.path[0] : undefined;
  throw new PaymentRuleError(issue.message, field);
}

function actor(actorId: string) {
  if (typeof actorId !== "string" || !isPlausibleId(actorId.trim())) throw new PaymentRuleError("Acesso negado.");
  return actorId.trim();
}

// Campos e ordem são explícitos e versionados. A autoria permanece a do primeiro COMMIT, mesmo
// quando outro usuário autorizado reenvia a operação. O motivo e a data do estorno entram também
// na correção composta; não são reconstruídos a partir do estado atual do pagamento.
function fingerprint(operation: Operation, input: CreatePaymentInput | ReversePaymentInput | ReplacePaymentInput) {
  const data = {
    version: 1,
    operation,
    chargeId: "chargeId" in input ? input.chargeId : null,
    paymentId: "paymentId" in input ? input.paymentId : null,
    amountCents: "amountCents" in input ? input.amountCents : null,
    receivedOn: "receivedOn" in input ? toDateInput(input.receivedOn) : null,
    reason: "reason" in input ? input.reason : null,
    reversedOn: "reversedOn" in input ? toDateInput(input.reversedOn) : null,
    replacesPaymentId: operation === "CORRECAO" && "paymentId" in input
      ? input.paymentId
      : "replacesPaymentId" in input ? input.replacesPaymentId ?? null : null,
  };
  return `v1:${createHash("sha256").update(JSON.stringify(data)).digest("hex")}`;
}

function reuse(existing: Existing, expected: string): PaymentResult {
  if (existing.fingerprint !== expected) throw new PaymentRuleError(PAYMENT_KEY_MISMATCH);
  return { id: existing.id, created: false };
}

function reuseReversal(existing: Existing, expected: string): ReversalResult {
  if (existing.fingerprint !== expected) throw new PaymentRuleError(PAYMENT_KEY_MISMATCH);
  return { id: existing.id, alreadyReversed: true };
}

function byPaymentKey(db: Pick<Tx, "payment">, key: string) {
  return db.payment.findUnique({ where: { idempotencyKey: key }, select: EXISTING_SELECT });
}

function byReversalKey(db: Pick<Tx, "paymentReversal">, key: string) {
  return db.paymentReversal.findUnique({ where: { idempotencyKey: key }, select: EXISTING_SELECT });
}

async function lockCharge(tx: Tx, chargeId: string) {
  const [charge] = await tx.$queryRaw<{ id: string; status: "ATIVA" | "CANCELADA"; amountCents: number }[]>`
    SELECT "id", "status"::text AS "status", "amountCents"
    FROM "Charge" WHERE "id" = ${chargeId} FOR UPDATE`;
  if (!charge) throw new PaymentRuleError(PAYMENT_MESSAGES.chargeNotFound);
  return charge;
}

async function lockPaymentCharge(tx: Tx, paymentId: string) {
  // Payment é imutável: a leitura inicial serve só para localizar o mutex. Estado de estorno,
  // substituição e saldo são relidos em novos comandos depois de obter a trava.
  const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { chargeId: true } });
  if (!payment) throw new PaymentRuleError(PAYMENT_NOT_FOUND);
  return lockCharge(tx, payment.chargeId);
}

function assertActive(charge: { status: "ATIVA" | "CANCELADA" }) {
  if (charge.status === "CANCELADA") throw new PaymentRuleError(CHARGE_CANCELLED);
}

async function originalPayment(tx: Tx, paymentId: string) {
  const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: ORIGINAL_SELECT });
  if (!payment) throw new PaymentRuleError(PAYMENT_NOT_FOUND);
  return payment;
}

function assertReversalDate(receivedOn: Date, reversedOn: Date) {
  if (reversedOn.getTime() < receivedOn.getTime()) {
    throw new PaymentRuleError(PAYMENT_MESSAGES.reversedBeforeReceived, "reversedOn");
  }
}

async function assertBalance(tx: Tx, charge: { id: string; amountCents: number }, amountCents: number) {
  // Comando separado: o snapshot da soma precisa ser obtido depois de uma eventual espera pela
  // trava, e a correção precisa enxergar o estorno inserido pela própria transação.
  const total = await tx.payment.aggregate({
    where: { chargeId: charge.id, reversal: { is: null } },
    _sum: { amountCents: true },
  });
  const receivedCents = total._sum.amountCents ?? 0;
  const balance = charge.amountCents - receivedCents;
  if (!Number.isSafeInteger(receivedCents) || receivedCents < 0 || balance < 0) {
    throw new PaymentRuleError(PAYMENT_MESSAGES.invalidBalance);
  }
  if (amountCents > balance) throw new PaymentRuleError(PAYMENT_EXCEEDS_BALANCE, "amount");
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export async function createPayment(
  db: Db,
  actorId: string,
  input: CreatePaymentInput,
  clock: Clock = {},
): Promise<PaymentResult> {
  const data = validate(paymentDataSchemas(clock.now).create, input);
  const author = actor(actorId);
  const key = `RECEBIMENTO:${data.requestId}`;
  const hash = fingerprint("RECEBIMENTO", data);
  try {
    return await db.$transaction(async (tx) => {
      const charge = await lockCharge(tx, data.chargeId);
      const existing = await byPaymentKey(tx, key);
      if (existing) return reuse(existing, hash);
      assertActive(charge);
      if (data.replacesPaymentId) {
        const original = await originalPayment(tx, data.replacesPaymentId);
        if (original.chargeId !== charge.id) throw new PaymentRuleError(PAYMENT_DIFFERENT_CHARGE, "replacesPaymentId");
        if (!original.reversal) throw new PaymentRuleError(PAYMENT_NOT_REVERSED, "replacesPaymentId");
        if (original.replacedBy) throw new PaymentRuleError(PAYMENT_ALREADY_REPLACED, "replacesPaymentId");
      }
      await assertBalance(tx, charge, data.amountCents);
      const created = await tx.payment.create({
        data: {
          chargeId: charge.id,
          amountCents: data.amountCents,
          receivedOn: data.receivedOn,
          createdById: author,
          idempotencyKey: key,
          fingerprint: hash,
          replacesPaymentId: data.replacesPaymentId,
        },
        select: { id: true },
      });
      return { id: created.id, created: true };
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    // Chaves são únicas também entre cobranças diferentes. Quem perdeu a corrida só relê o
    // resultado confirmado: não há retry de escrita nem mudança da autoria original.
    if (isUniqueViolation(error)) {
      const existing = await byPaymentKey(db, key);
      if (existing) return reuse(existing, hash);
      if (data.replacesPaymentId && await db.payment.findUnique({ where: { replacesPaymentId: data.replacesPaymentId }, select: { id: true } })) {
        throw new PaymentRuleError(PAYMENT_ALREADY_REPLACED, "replacesPaymentId");
      }
    }
    throw error;
  }
}

export async function reversePayment(
  db: Db,
  actorId: string,
  input: ReversePaymentInput,
  clock: Clock = {},
): Promise<ReversalResult> {
  const data = validate(paymentDataSchemas(clock.now).reverse, input);
  const author = actor(actorId);
  const key = `ESTORNO:${data.requestId}`;
  const hash = fingerprint("ESTORNO", data);
  try {
    return await db.$transaction(async (tx) => {
      const charge = await lockPaymentCharge(tx, data.paymentId);
      const existing = await byReversalKey(tx, key);
      if (existing) return reuseReversal(existing, hash);
      const original = await originalPayment(tx, data.paymentId);
      if (original.reversal) return { id: original.reversal.id, alreadyReversed: true };
      assertActive(charge);
      assertReversalDate(original.receivedOn, data.reversedOn);
      const created = await tx.paymentReversal.create({
        data: { paymentId: original.id, reason: data.reason, reversedOn: data.reversedOn, createdById: author, idempotencyKey: key, fingerprint: hash },
        select: { id: true },
      });
      return { id: created.id, alreadyReversed: false };
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await byReversalKey(db, key);
      if (existing) return reuseReversal(existing, hash);
      const reversed = await db.paymentReversal.findUnique({ where: { paymentId: data.paymentId }, select: { id: true } });
      if (reversed) return { id: reversed.id, alreadyReversed: true };
    }
    throw error;
  }
}

export async function replacePayment(
  db: Db,
  actorId: string,
  input: ReplacePaymentInput,
  clock: Clock = {},
): Promise<PaymentResult> {
  const data = validate(paymentDataSchemas(clock.now).replace, input);
  const author = actor(actorId);
  const key = `CORRECAO:${data.requestId}`;
  const hash = fingerprint("CORRECAO", data);
  try {
    return await db.$transaction(async (tx) => {
      const charge = await lockPaymentCharge(tx, data.paymentId);
      const existing = await byPaymentKey(tx, key);
      if (existing) return reuse(existing, hash);
      // A operação composta escreve as duas tabelas juntas. Uma chave de correção já usada para
      // outro estorno não pode ser apropriada, mesmo que ainda não exista seu pagamento esperado.
      if (await byReversalKey(tx, key)) throw new PaymentRuleError(PAYMENT_KEY_MISMATCH);
      assertActive(charge);
      const original = await originalPayment(tx, data.paymentId);
      if (original.replacedBy) throw new PaymentRuleError(PAYMENT_ALREADY_REPLACED);
      if (original.reversal) throw new PaymentRuleError(PAYMENT_ALREADY_REVERSED);
      assertReversalDate(original.receivedOn, data.reversedOn);
      await tx.paymentReversal.create({
        data: { paymentId: original.id, reason: data.reason, reversedOn: data.reversedOn, createdById: author, idempotencyKey: key, fingerprint: hash },
        select: { id: true },
      });
      await assertBalance(tx, charge, data.amountCents);
      const created = await tx.payment.create({
        data: {
          chargeId: charge.id,
          amountCents: data.amountCents,
          receivedOn: data.receivedOn,
          createdById: author,
          idempotencyKey: key,
          fingerprint: hash,
          replacesPaymentId: original.id,
        },
        select: { id: true },
      });
      return { id: created.id, created: true };
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await byPaymentKey(db, key);
      if (existing) return reuse(existing, hash);
      if (await byReversalKey(db, key)) throw new PaymentRuleError(PAYMENT_KEY_MISMATCH);
      const substitute = await db.payment.findUnique({ where: { replacesPaymentId: data.paymentId }, select: { id: true } });
      if (substitute) throw new PaymentRuleError(PAYMENT_ALREADY_REPLACED);
    }
    throw error;
  }
}
