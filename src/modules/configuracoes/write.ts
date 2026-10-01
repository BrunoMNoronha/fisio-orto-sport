// Gravação das configurações (issue #63) sobre um cliente Prisma qualquer, para o teste de
// integração usar o mesmo código da action. Sem `server-only` pelo mesmo motivo da auditoria.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { writeAudit } from "@/modules/auditoria/write";
import {
  AGENDA_VIEWS,
  DEFAULT_SETTINGS,
  SETTINGS_FIELDS,
  auditDetails,
  changedFields,
  type ClinicSettingsValues,
  type SettingsField,
} from "./settings";

export const SETTINGS_ID = 1;

// Outra gravação chegou antes (versão diferente da lida): nada foi alterado.
export class SettingsConflictError extends Error {
  constructor() {
    super("As configurações foram alteradas por outra pessoa. Recarregue a página para ver a versão atual.");
    this.name = "SettingsConflictError";
  }
}

export type SettingsActor = { id: string; role: Role; ip: string | null };

// Linha do banco: a visão vem como texto (o CHECK garante um valor de AGENDA_VIEWS). Um valor fora
// da lista, que o banco não aceitaria, cairia no padrão em vez de quebrar a agenda.
type SettingsRow = Omit<ClinicSettingsValues, "agendaDefaultView"> & { agendaDefaultView: string };

export function pickValues(source: SettingsRow): ClinicSettingsValues {
  const values = Object.fromEntries(SETTINGS_FIELDS.map((field) => [field, source[field]])) as SettingsRow;
  const view = AGENDA_VIEWS.find((item) => item === values.agendaDefaultView) ?? DEFAULT_SETTINGS.agendaDefaultView;
  return { ...values, agendaDefaultView: view };
}

// Salva o conjunto inteiro numa transação: configuração e registro de auditoria entram juntos ou
// nenhum entra. `expectedVersion` é a versão lida pelo formulário (0 = ainda não havia linha).
// Sem mudança real, não grava nem audita.
export async function saveClinicSettings(
  db: Pick<PrismaClient, "$transaction">,
  input: { values: ClinicSettingsValues; expectedVersion: number; actor: SettingsActor },
): Promise<{ version: number; fields: SettingsField[] }> {
  const { values, expectedVersion, actor } = input;
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('agenda:capacity', 0))`;
      const current = await tx.clinicSettings.findUnique({ where: { id: SETTINGS_ID } });
      const currentVersion = current?.version ?? 0;
      if (currentVersion !== expectedVersion) throw new SettingsConflictError();

      const fields = changedFields(current ? pickValues(current) : DEFAULT_SETTINGS, values);
      if (fields.length === 0) return { version: currentVersion, fields };

      let version: number;
      if (!current) {
        // Duas primeiras gravações simultâneas: a segunda viola a chave primária (P2002).
        await tx.clinicSettings.create({ data: { id: SETTINGS_ID, ...values, version: 1, updatedById: actor.id } });
        version = 1;
      } else {
        const { count } = await tx.clinicSettings.updateMany({
          where: { id: SETTINGS_ID, version: expectedVersion },
          data: { ...values, version: { increment: 1 }, updatedById: actor.id },
        });
        if (count === 0) throw new SettingsConflictError();
        version = expectedVersion + 1;
      }

      await writeAudit(tx, {
        action: "CONFIGURACAO_ALTERADA",
        result: "SUCESSO",
        actorId: actor.id,
        actorRole: actor.role,
        ip: actor.ip,
        details: auditDetails(version, fields),
      });
      return { version, fields };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
      throw new SettingsConflictError();
    }
    throw error;
  }
}
