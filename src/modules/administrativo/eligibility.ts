import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { parseCivilDate } from "./catalog-validation";
import { readCoverageContext } from "./beneficiary-context";
export type EligibilityInput = { patientId: string; coverageId: string; procedureId: string; executionOn: string; quantity: number; itemId?: string };
export async function readEligibilityTx(tx: Prisma.TransactionClient, input: EligibilityInput) {
  const date = parseCivilDate(input.executionOn);
  if (!date || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 2147483647) return { status: "ENTRADA_INVALIDA" as const };
  const coverage = await readCoverageContext(tx,input.coverageId);
  if (!coverage || coverage.patientId !== input.patientId) return { status: "COBERTURA_INCOMPATIVEL" as const };
  if (!coverage.active || coverage.patient.status !== "ATIVO" || !coverage.contract.active || !coverage.contract.operator.active) return { status: "INATIVO" as const };
  if (date < coverage.startsOn || (coverage.endsOn && date > coverage.endsOn)) return { status: "COBERTURA_FORA_DA_VIGENCIA" as const };
  const procedure = await tx.billingProcedure.findUnique({ where: { id: input.procedureId }, select: {
    id: true, contractId: true, active: true, code: true, tableCode: true, name: true, version: true,
  } });
  if (!procedure || procedure.contractId !== coverage.contractId) return { status: "PROCEDIMENTO_INCOMPATIVEL" as const };
  if (!procedure.active) return { status: "INATIVO" as const };
  const rule = await tx.procedureAuthorizationRule.findFirst({ where: { procedureId: procedure.id }, orderBy: { version: "desc" } });
  if (!rule || rule.mode === "PENDENTE") return { status: "REGRA_PENDENTE" as const };
  const snapshot = { patientId: coverage.patientId, coverageId: coverage.id, coverageVersion: coverage.version, contractId: coverage.contractId,
    beneficiaryName: coverage.beneficiaryName, cardNumber: coverage.cardNumber, planName: coverage.planName,
    coverageStartsOn: coverage.startsOn.toISOString().slice(0,10), coverageEndsOn: coverage.endsOn?.toISOString().slice(0,10) ?? null,
    procedureId: procedure.id, procedureVersion: procedure.version, code: procedure.code, tableCode: procedure.tableCode, procedureName: procedure.name,
    ruleId: rule.id, ruleVersion: rule.version, executionOn: input.executionOn, quantity: input.quantity };
  if (rule.mode === "DISPENSADA") return { status: "DISPENSADA" as const, snapshot };
  if (!input.itemId) return { status: "AUTORIZACAO_PENDENTE" as const };
  const item = await tx.authorizationItem.findUnique({ where: { id: input.itemId }, include: { authorization: true } });
  if (!item || item.procedureId !== procedure.id || item.authorization.coverageId !== coverage.id) return { status: "AUTORIZACAO_INCOMPATIVEL" as const };
  if (!item.active || !item.authorization.active) return { status: "AUTORIZACAO_CANCELADA" as const };
  if (date < item.authorization.startsOn || date > item.authorization.endsOn) return { status: "AUTORIZACAO_FORA_DA_VIGENCIA" as const };
  const sum = await tx.authorizationUse.aggregate({ where: { itemId: item.id }, _sum: { quantity: true } });
  const consumed = sum._sum.quantity ?? 0, available = item.authorizedQuantity - consumed;
  const balance = { authorized: item.authorizedQuantity, consumed, available };
  if (input.quantity > available) return { status: "SALDO_INSUFICIENTE" as const, balance };
  return { status: "APTA" as const, balance, snapshot: { ...snapshot, authorizationId: item.authorization.id,
    authorizationVersion: item.authorization.version, authorizationNumber: item.authorization.number, accessCode: item.authorization.accessCode,
    itemId: item.id, itemVersion: item.version } };
}
export async function readEligibility(db: Pick<PrismaClient,"$transaction">, input: EligibilityInput) {
  return db.$transaction((tx) => readEligibilityTx(tx,input), { isolationLevel: "RepeatableRead" });
}
