import type { PrismaClient } from "@/generated/prisma/client";
import { parseCivilDate } from "./catalog-validation";

// Uso interno após autorização. Retorna cópia versionada, nunca uma referência a preço corrente.
// ADM-03/ADM-05 deverão persistir estes valores na conferência/fechamento, sem resolvê-los novamente.
export async function readTariffSnapshot(db: Pick<PrismaClient, "$transaction">, contractId: string, procedureId: string, civilDate: string) {
  const date = parseCivilDate(civilDate);
  if (!date) return { status: "DATA_INVALIDA" as const };
  return db.$transaction(async (tx) => {
    const procedure = await tx.billingProcedure.findUnique({ where: { id: procedureId }, select: {
      id: true, contractId: true, tableCode: true, code: true, name: true, version: true, active: true,
      contract: { select: { active: true, operator: { select: { active: true } } } },
    } });
    if (!procedure || procedure.contractId !== contractId) return { status: "PROCEDIMENTO_NAO_ENCONTRADO" as const };
    if (!procedure.active || !procedure.contract.active || !procedure.contract.operator.active) return { status: "INATIVO" as const };
    const tariffs = await tx.procedureTariff.findMany({ where: { procedureId, active: true,
      startsOn: { lte: date }, OR: [{ endsOn: null }, { endsOn: { gte: date } }],
    }, take: 2, select: { id: true, version: true, amountCents: true, startsOn: true, endsOn: true } });
    if (tariffs.length !== 1) return { status: tariffs.length ? "TARIFA_AMBIGUA" as const : "SEM_TARIFA" as const };
    const tariff = tariffs[0];
    return { status: "OK" as const, snapshot: {
      contractId, procedureId, procedureVersion: procedure.version, tableCode: procedure.tableCode, code: procedure.code, name: procedure.name,
      tariffId: tariff.id, tariffVersion: tariff.version, amountCents: tariff.amountCents,
      executionDate: civilDate, startsOn: tariff.startsOn.toISOString().slice(0, 10), endsOn: tariff.endsOn?.toISOString().slice(0, 10) ?? null,
    } };
  }, { isolationLevel: "RepeatableRead" });
}
