import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { z } from "zod";
import { authorizationRuleSchema, consumptionSchema, type BeneficiaryInput } from "./beneficiary-validation";
import { AdministrativeConfigError, CONFIG_CONFLICT } from "./service";
type Db = Pick<PrismaClient, "$transaction">;
export const beneficiaryFingerprint = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const snapshot = (v: unknown): Prisma.InputJsonObject => JSON.parse(JSON.stringify(v, (_key, value) => {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(value) ? value.slice(0,10) : value;
}));
export async function lockBeneficiary(tx: Prisma.TransactionClient) {
  // Mesma ordem das configurações: impede disputa com inativação contratual.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('administrativo:configuracao',0))`;
}
function translate(error: unknown): never {
  if (error instanceof AdministrativeConfigError) throw error;
  const text = String(error);
  const messages = ["Há consumo vigente; corrija/devolva a produção antes de alterar a cobertura",
    "Há consumo vigente; autorização não pode ser corrigida ou cancelada", "Quantidade ou cancelamento incompatível com consumo vigente",
    "Vigência da autorização deve estar dentro da cobertura", "Saldo autorizado insuficiente",
    "Cobertura/autorização indisponível na data da execução", "Regra pendente ou dispensada não permite consumo de autorização",
    "Paciente, operadora, contrato, cobertura, autorização ou procedimento indisponível", "Procedimento ou contrato inativo"];
  const message = messages.find((m) => text.includes(m));
  if (message) throw new AdministrativeConfigError(message);
  if (typeof error === "object" && error && "code" in error && error.code === "P2002") throw new AdministrativeConfigError("Identificador já cadastrado ou envio já utilizado. Recarregue e confira os dados.");
  throw error;
}
export async function saveBeneficiary(db: Db, actorId: string, input: BeneficiaryInput) {
  const { id, requestId, expectedVersion, reason, ...data } = input.values;
  const fingerprint = beneficiaryFingerprint(input);
  try {
    return await db.$transaction(async (tx) => {
      await lockBeneficiary(tx);
      const replay = await tx.beneficiaryChange.findUnique({ where: { requestId } });
      if (replay) {
        if (replay.fingerprint !== fingerprint) throw new AdministrativeConfigError("Envio já utilizado com outros dados.");
        return replay.coverageId ?? replay.authorizationId ?? replay.itemId!;
      }
      const meta = { updatedById: actorId };
      let origin: { coverageId: string } | { authorizationId: string } | { itemId: string };
      if (input.kind === "coverage") {
        const current = await tx.beneficiaryCoverage.findUnique({ where: { id } });
        if ((current?.version ?? 0) !== expectedVersion) throw new AdministrativeConfigError(CONFIG_CONFLICT);
        const { patientId, contractId } = input.values;
        if (current && (current.patientId !== patientId || current.contractId !== contractId)) throw new AdministrativeConfigError("Paciente e contrato são imutáveis. Crie uma nova cobertura.");
        const { beneficiaryName, cardNumber, planName, startsOn, endsOn, active } = input.values;
        const fields = { patientId, contractId, beneficiaryName, cardNumber, planName, startsOn, endsOn, active, ...meta };
        if (current) await tx.beneficiaryCoverage.update({ where: { id }, data: { ...fields, version: { increment: 1 } } });
        else await tx.beneficiaryCoverage.create({ data: { id, ...fields, createdById: actorId } });
        origin = { coverageId: id };
      } else if (input.kind === "authorization") {
        const current = await tx.benefitAuthorization.findUnique({ where: { id } });
        if ((current?.version ?? 0) !== expectedVersion) throw new AdministrativeConfigError(CONFIG_CONFLICT);
        const { coverageId, contractId, number, accessCode, issuedOn, startsOn, endsOn, active } = input.values;
        const coverage = await tx.beneficiaryCoverage.findUnique({ where: { id: coverageId }, select: { contractId: true } });
        if (!coverage || coverage.contractId !== contractId) throw new AdministrativeConfigError("Cobertura e contrato incompatíveis.");
        if (current && (current.coverageId !== coverageId || current.contractId !== contractId)) throw new AdministrativeConfigError("Cobertura da autorização é imutável.");
        const fields = { coverageId, contractId, number, accessCode, issuedOn, startsOn, endsOn, active, ...meta };
        if (current) await tx.benefitAuthorization.update({ where: { id }, data: { ...fields, version: { increment: 1 } } });
        else await tx.benefitAuthorization.create({ data: { id, ...fields, createdById: actorId } });
        origin = { authorizationId: id };
      } else {
        const current = await tx.authorizationItem.findUnique({ where: { id } });
        if ((current?.version ?? 0) !== expectedVersion) throw new AdministrativeConfigError(CONFIG_CONFLICT);
        const { authorizationId, contractId, procedureId, authorizedQuantity, active } = input.values;
        const authorization = await tx.benefitAuthorization.findUnique({ where: { id: authorizationId }, select: { contractId: true } });
        const procedure = await tx.billingProcedure.findUnique({ where: { id: procedureId }, select: { contractId: true } });
        if (!authorization || !procedure || authorization.contractId !== contractId || procedure.contractId !== contractId) throw new AdministrativeConfigError("Procedimento e autorização devem pertencer ao mesmo contrato.");
        if (current && (current.authorizationId !== authorizationId || current.contractId !== contractId || current.procedureId !== procedureId)) throw new AdministrativeConfigError("Vínculo do item é imutável.");
        const fields = { authorizationId, contractId, procedureId, authorizedQuantity, active, ...meta };
        if (current) await tx.authorizationItem.update({ where: { id }, data: { ...fields, version: { increment: 1 } } });
        else await tx.authorizationItem.create({ data: { id, ...fields, createdById: actorId } });
        origin = { itemId: id };
      }
      await tx.beneficiaryChange.create({ data: { ...origin, version: expectedVersion+1, snapshot: snapshot(data), actorId, reason, requestId, fingerprint } });
      return id;
    });
  } catch (error) { translate(error); }
}
export async function saveAuthorizationRule(db: Db, actorId: string, values: z.output<typeof authorizationRuleSchema>) {
  const { id, procedureId, expectedVersion, mode, reference, reason, requestId } = values;
  const fingerprint = beneficiaryFingerprint(values);
  try { return await db.$transaction(async (tx) => {
    await lockBeneficiary(tx);
    const replay = await tx.procedureAuthorizationRule.findUnique({ where: { requestId } });
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw new AdministrativeConfigError("Envio já utilizado com outros dados.");
      return replay.id;
    }
    const current = await tx.procedureAuthorizationRule.findFirst({ where: { procedureId }, orderBy: { version: "desc" }, select: { version: true } });
    if ((current?.version ?? 0) !== expectedVersion) throw new AdministrativeConfigError(CONFIG_CONFLICT);
    await tx.procedureAuthorizationRule.create({ data: { id, procedureId, version: expectedVersion+1, mode, reference, reason, requestId, fingerprint, actorId } });
    return id;
  }); } catch (error) { translate(error); }
}
// Chamadas internas da conferência futura. Sem Server Action pública de consumo nesta issue.
// ADM-03 deverá usar a variante Tx na mesma transação do item de produção.
export async function consumeAuthorizationTx(tx: Prisma.TransactionClient, actorId: string, raw: z.input<typeof consumptionSchema>) {
  const input = consumptionSchema.parse(raw);
  await lockBeneficiary(tx);
  const fingerprint = beneficiaryFingerprint({ operation: "consume", ...raw });
  const replay = await tx.authorizationUse.findFirst({ where: { OR: [{ requestId: input.requestId }, { sourceKey: input.sourceKey }] } });
  if (replay) {
    if (replay.fingerprint !== fingerprint) throw new AdministrativeConfigError("Consumo/envio já utilizado com outros dados.");
    return replay;
  }
  const parent = await tx.authorizationItem.findUnique({ where: { id: input.itemId }, select: { authorizationId: true } });
  if (!parent) throw new AdministrativeConfigError("Item autorizado não encontrado.");
  await tx.$queryRaw`SELECT id FROM "BenefitAuthorization" WHERE id=${parent.authorizationId} FOR UPDATE`;
  return tx.authorizationUse.create({ data: { id: randomUUID(), ...input, executionOn: input.executionOn, snapshot: {}, fingerprint, actorId } });
}
export async function consumeAuthorization(db: Db, actorId: string, input: z.input<typeof consumptionSchema>) {
  try { return await db.$transaction((tx) => consumeAuthorizationTx(tx, actorId, input)); }
  catch (error) { translate(error); }
}
export async function returnAuthorizationTx(tx: Prisma.TransactionClient, actorId: string, input: { useId: string; requestId: string; reason: string }) {
  if (!input.reason.trim() || input.reason.length > 300 || !/^[0-9a-f-]{36}$/i.test(input.requestId)) throw new AdministrativeConfigError("Informe motivo e identificador válidos.");
  await lockBeneficiary(tx);
  const fingerprint = beneficiaryFingerprint({ operation: "return", ...input });
  const replay = await tx.authorizationUse.findUnique({ where: { requestId: input.requestId } });
  if (replay) {
    if (replay.fingerprint !== fingerprint) throw new AdministrativeConfigError("Envio já utilizado com outros dados.");
    return replay;
  }
  const original = await tx.authorizationUse.findUnique({ where: { id: input.useId } });
  if (!original || original.quantity <= 0) throw new AdministrativeConfigError("Consumo original não encontrado.");
  return tx.authorizationUse.create({ data: { id: randomUUID(), itemId: original.itemId, quantity: -original.quantity,
    executionOn: original.executionOn, reversesId: original.id, sourceKey: `return:${original.id}`, requestId: input.requestId,
    fingerprint, snapshot: original.snapshot as Prisma.InputJsonObject, reason: input.reason, actorId } });
}
export async function returnAuthorization(db: Db, actorId: string, input: Parameters<typeof returnAuthorizationTx>[2]) {
  try { return await db.$transaction((tx) => returnAuthorizationTx(tx, actorId, input)); }
  catch (error) { translate(error); }
}
