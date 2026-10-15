// Serviço transacional compartilhado pela action e pelos testes PostgreSQL.
import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type { OperatorInput, ContractInput } from "./validation";
import type { ProcedureInput, TariffInput, ProfessionalInput } from "./catalog-validation";

export class AdministrativeConfigError extends Error {}
export const CONFIG_CONFLICT = "Este cadastro foi alterado por outra pessoa. Recarregue a página antes de salvar.";

type Db = Pick<PrismaClient, "$transaction">;
type Input = { kind: "operator"; values: OperatorInput } | { kind: "contract"; values: ContractInput }
  | { kind: "procedure"; values: ProcedureInput } | { kind: "tariff"; values: TariffInput }
  | { kind: "professional"; values: ProfessionalInput };
export const TARIFF_OVERLAP = "Já existe uma tarifa ativa nesse período. Ajuste as vigências ou inative a tarifa que será substituída.";

export async function saveAdministrativeConfig(db: Db, actorId: string, input: Input): Promise<string> {
  const { id, requestId, expectedVersion, reason, ...values } = input.values;
  const fingerprint = createHash("sha256").update(JSON.stringify({ kind: input.kind, id, expectedVersion, reason, values })).digest("hex");
  try {
    return await db.$transaction(async (tx) => {
      // Baixo volume de configuração: uma ordem de trava para edição, inativação e replay.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('administrativo:configuracao', 0))`;
      const previous = await tx.administrativeConfigChange.findUnique({ where: { requestId } });
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new AdministrativeConfigError("Este envio já foi utilizado com outros dados. Reabra o formulário.");
        return previous.operatorId ?? previous.contractId ?? previous.procedureId ?? previous.tariffId ?? previous.professionalId!;
      }

      if (input.kind === "operator") {
        const current = await tx.healthOperator.findUnique({ where: { id } });
        if ((current?.version ?? 0) !== expectedVersion) throw new AdministrativeConfigError(CONFIG_CONFLICT);
        const { name, registrationAns, active } = input.values;
        const data = { name, registrationAns, active, updatedById: actorId };
        if (current) await tx.healthOperator.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
        else await tx.healthOperator.create({ data: { id, ...data, createdById: actorId } });
        await tx.administrativeConfigChange.create({ data: {
          operatorId: id, version: expectedVersion + 1, snapshot: { name, registrationAns, active }, reason, requestId, fingerprint, actorId,
        } });
      } else if (input.kind === "contract") {
        const { operatorId, name, providerCode, cnes, tissVersion, manualReference, homologationChannel, monthlySessions, closingIntervalDays, maxGuides, maxItems, maxXmlBytes, maxExportRows, active } = input.values;
        const operator = await tx.healthOperator.findUnique({ where: { id: operatorId }, select: { active: true } });
        if (!operator) throw new AdministrativeConfigError("Operadora não encontrada.");
        if (active && !operator.active) throw new AdministrativeConfigError("Reative a operadora antes de ativar um contrato.");
        const current = await tx.operatorContract.findUnique({ where: { id } });
        if ((current?.version ?? 0) !== expectedVersion) throw new AdministrativeConfigError(CONFIG_CONFLICT);
        if (current && current.operatorId !== operatorId) throw new AdministrativeConfigError("O vínculo do contrato com a operadora não pode ser alterado.");
        const data = { name, providerCode, cnes, tissVersion, manualReference, homologationChannel, monthlySessions, closingIntervalDays, maxGuides, maxItems, maxXmlBytes, maxExportRows, active, updatedById: actorId };
        if (current) await tx.operatorContract.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
        else await tx.operatorContract.create({ data: { id, operatorId, ...data, createdById: actorId } });
        await tx.administrativeConfigChange.create({ data: {
          contractId: id, version: expectedVersion + 1,
          snapshot: { operatorId, name, providerCode, cnes, tissVersion, manualReference, homologationChannel, monthlySessions, closingIntervalDays, maxGuides, maxItems, maxXmlBytes, maxExportRows, active }, reason, requestId, fingerprint, actorId,
        } });
      } else if (input.kind === "procedure") {
        const { contractId, tableCode, code, name, active } = input.values;
        const parent = await tx.operatorContract.findUnique({ where: { id: contractId }, select: { active: true, operator: { select: { active: true } } } });
        const current = await tx.billingProcedure.findUnique({ where: { id } });
        if ((current?.version ?? 0) !== expectedVersion) throw new AdministrativeConfigError(CONFIG_CONFLICT);
        if (!parent || ((!current || active) && (!parent.active || !parent.operator.active))) throw new AdministrativeConfigError("Ative a operadora e o contrato antes de cadastrar ou ativar procedimentos.");
        if (current && (current.contractId !== contractId || current.tableCode !== tableCode || current.code !== code)) throw new AdministrativeConfigError("Contrato, tabela e código do procedimento são imutáveis. Inative e cadastre o procedimento correto.");
        const snapshot = { contractId, tableCode, code, name, active };
        const data = { name, active, updatedById: actorId };
        if (current) await tx.billingProcedure.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
        else await tx.billingProcedure.create({ data: { id, ...snapshot, createdById: actorId, updatedById: actorId } });
        await tx.administrativeConfigChange.create({ data: { procedureId: id, version: expectedVersion + 1, snapshot, reason, requestId, fingerprint, actorId } });
      } else if (input.kind === "tariff") {
        const { procedureId, amount, startsOn, endsOn, active } = input.values;
        const parent = await tx.billingProcedure.findUnique({ where: { id: procedureId }, select: {
          active: true, contract: { select: { active: true, operator: { select: { active: true } } } },
        } });
        const current = await tx.procedureTariff.findUnique({ where: { id } });
        if ((current?.version ?? 0) !== expectedVersion) throw new AdministrativeConfigError(CONFIG_CONFLICT);
        if (!parent || ((!current || active) && (!parent.active || !parent.contract.active || !parent.contract.operator.active))) throw new AdministrativeConfigError("Ative a operadora, o contrato e o procedimento antes de cadastrar ou ativar tarifas.");
        if (current && current.procedureId !== procedureId) throw new AdministrativeConfigError("O procedimento da tarifa não pode ser alterado.");
        if (active) {
          const overlap = await tx.procedureTariff.findFirst({ where: { procedureId, active: true, id: { not: id },
            ...(endsOn ? { startsOn: { lte: endsOn } } : {}), OR: [{ endsOn: null }, { endsOn: { gte: startsOn } }],
          }, select: { id: true } });
          if (overlap) throw new AdministrativeConfigError(TARIFF_OVERLAP);
        }
        const data = { amountCents: amount, startsOn, endsOn, active, updatedById: actorId };
        if (current) await tx.procedureTariff.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
        else await tx.procedureTariff.create({ data: { id, procedureId, ...data, createdById: actorId } });
        const snapshot = { procedureId, amountCents: amount, startsOn: startsOn.toISOString().slice(0, 10), endsOn: endsOn?.toISOString().slice(0, 10) ?? null, active };
        await tx.administrativeConfigChange.create({ data: { tariffId: id, version: expectedVersion + 1, snapshot, reason, requestId, fingerprint, actorId } });
      } else {
        const { userId, name, purpose, councilCode, councilNumber, councilState, occupationCode, active } = input.values;
        const current = await tx.billingProfessional.findUnique({ where: { id } });
        if ((current?.version ?? 0) !== expectedVersion) throw new AdministrativeConfigError(CONFIG_CONFLICT);
        if (userId && current?.userId !== userId) {
          // Serializa o novo vínculo com desativação/alteração do perfil do usuário.
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR SHARE`;
          const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, active: true } });
          if (!user || !user.active || user.role !== "FISIOTERAPEUTA") throw new AdministrativeConfigError("Escolha um usuário fisioterapeuta ativo ou deixe o vínculo vazio.");
        }
        const snapshot = { userId, name, purpose, councilCode, councilNumber, councilState, occupationCode, active };
        const data = { ...snapshot, updatedById: actorId };
        if (current) await tx.billingProfessional.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
        else await tx.billingProfessional.create({ data: { id, ...data, createdById: actorId } });
        await tx.administrativeConfigChange.create({ data: { professionalId: id, version: expectedVersion + 1, snapshot, reason, requestId, fingerprint, actorId } });
      }
      return id;
    });
  } catch (error) {
    if (error instanceof AdministrativeConfigError) throw error;
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
    if (code === "P2002") throw new AdministrativeConfigError("Registro ANS, nome de contrato, código de procedimento ou vínculo profissional já cadastrado. Confira os dados e recarregue a página.");
    if (String(error).includes("ProcedureTariff_no_overlap")) throw new AdministrativeConfigError(TARIFF_OVERLAP);
    throw error;
  }
}
