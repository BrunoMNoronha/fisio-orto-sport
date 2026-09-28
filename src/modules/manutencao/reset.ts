// Serviço da reinicialização preservando usuários (issue #62), compartilhado pelo `pnpm db:reset`
// (reset-cli.ts) e pela aba Desenvolvimento das Configurações (#78). Sem `server-only`: a CLI roda fora
// do Next. Regras de dados, proteções e conferências descritas em README.md.
//
// A exceção da auditoria (`includeAudit`) só existe na CLI; a ação web nunca a passa.
import type { PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { writeAudit } from "@/modules/auditoria/write";
import { lockMaintenance } from "./lock";

// Contrato de dados (issue #62; ScheduleBlock e ClinicSettings decididos em 27/09/2026).
export const PRESERVED_TABLES = ["User", "ClinicSettings", "_prisma_migrations"] as const;
export const CLEARED_TABLES = [
  "Session",
  "AuthRateLimit",
  "Patient",
  "Appointment",
  "ScheduleBlock",
  "Anamnesis",
  "Assessment",
  "AssessmentChange",
  "TherapyPlan",
  "TherapyPlanRevision",
  "TherapyPlanStatusChange",
  "TreatmentSession",
  "TreatmentSessionChange",
  "Reassessment",
  "ReassessmentChange",
] as const;
export const AUDIT_TABLE = "AuditLog";
// Palavra de confirmação (CLI e web).
export const RESET_WORD = "LIMPAR";
const AUDIT_TRIGGERS = ["AuditLog_immutable_row", "AuditLog_no_truncate"] as const;
const KNOWN_TABLES = new Set<string>([...PRESERVED_TABLES, ...CLEARED_TABLES, AUDIT_TABLE]);

export type ResetDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe" | "$transaction">;
export type ResetTx = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

// Ponto de teste: roda dentro da transação, depois da limpeza e antes das conferências.
export type ResetHooks = { afterClear?: (tx: ResetTx) => Promise<void> };

// Divergência de schema, dados ou proteções: a transação foi desfeita.
export class ResetAbort extends Error {}

const quote = (table: string) => `"${table.replace(/"/g, '""')}"`;

async function count(db: ResetTx, table: string) {
  const [row] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${quote(table)}`);
  return row.n;
}

// Impressão digital de todas as linhas e colunas de uma tabela preservada. Só é comparada, nunca
// impressa (inclui hashes de senha).
async function fingerprint(db: ResetTx, table: string) {
  const [row] = await db.$queryRawUnsafe<{ n: number; h: string }[]>(
    `SELECT count(*)::int AS n, coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), '') AS h FROM ${quote(table)} t`,
  );
  return row;
}

// Confere que o banco é exatamente o previsto: tabelas, dependências e as triggers da auditoria.
export async function inspectSchema(db: ResetTx): Promise<string[]> {
  const problems: string[] = [];
  const tables = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`,
  );
  const present = new Set(tables.map((table) => table.name));
  const unexpected = [...present].filter((name) => !KNOWN_TABLES.has(name)).sort();
  const missing = [...KNOWN_TABLES].filter((name) => !present.has(name)).sort();
  if (unexpected.length) problems.push(`Tabelas não previstas: ${unexpected.join(", ")}.`);
  if (missing.length) problems.push(`Tabelas previstas ausentes: ${missing.join(", ")}.`);

  // Uma tabela fora da limpeza que aponte para uma tabela limpa impediria o TRUNCATE (ou exigiria
  // cascata, que não é usada).
  const cleared = CLEARED_TABLES.map((name) => `'${name}'`).join(", ");
  const blockers = await db.$queryRawUnsafe<{ constraint: string; source: string; target: string }[]>(
    `SELECT c.conname AS "constraint", src.relname AS source, dst.relname AS target
       FROM pg_constraint c
       JOIN pg_class src ON src.oid = c.conrelid
       JOIN pg_class dst ON dst.oid = c.confrelid
       JOIN pg_namespace ns ON ns.oid = dst.relnamespace
      WHERE c.contype = 'f' AND ns.nspname = current_schema()
        AND dst.relname IN (${cleared}) AND src.relname NOT IN (${cleared})`,
  );
  for (const blocker of blockers) {
    problems.push(`Dependência não prevista: ${blocker.source} → ${blocker.target} (${blocker.constraint}).`);
  }

  const triggers = await db.$queryRawUnsafe<{ name: string; enabled: string }[]>(
    `SELECT t.tgname AS name, t.tgenabled::text AS enabled
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = current_schema() AND c.relname = '${AUDIT_TABLE}' AND NOT t.tgisinternal`,
  );
  for (const name of AUDIT_TRIGGERS) {
    const trigger = triggers.find((item) => item.name === name);
    if (!trigger) problems.push(`Trigger de proteção da auditoria ausente: ${name}.`);
    else if (trigger.enabled !== "O") problems.push(`Trigger de proteção da auditoria desligada: ${name}.`);
  }
  return problems;
}

export async function countTables(db: ResetTx, tables: readonly string[]) {
  const result: Record<string, number> = {};
  for (const table of tables) result[table] = await count(db, table);
  return result;
}

export type ResetPreview = {
  problems: string[];
  keep: Record<string, number>;
  clear: Record<string, number>;
};

// Simulação: nada é escrito. Sem `includeAudit`, a auditoria entra no que é preservado.
export async function previewReset(db: ResetTx, includeAudit = false): Promise<ResetPreview> {
  const problems = await inspectSchema(db);
  if (problems.length) return { problems, keep: {}, clear: {} };
  const clearList = includeAudit ? [...CLEARED_TABLES, AUDIT_TABLE] : [...CLEARED_TABLES];
  const keepList = includeAudit ? [...PRESERVED_TABLES] : [...PRESERVED_TABLES, AUDIT_TABLE];
  return { problems, keep: await countTables(db, keepList), clear: await countTables(db, clearList) };
}

export type ResetActor = { id: string; role: Role; ip: string | null };

// Execução em uma transação; qualquer divergência lança ResetAbort e desfaz tudo. `expectedDatabase`
// (web) confere o banco da conexão dentro da transação. Com `actor` (web), grava um evento de auditoria
// depois da limpeza, na mesma transação.
export async function executeReset(
  db: ResetDb,
  options: { includeAudit?: boolean; expectedDatabase?: string; actor?: ResetActor; hooks?: ResetHooks } = {},
): Promise<{ users: number; cleared: Record<string, number>; before: Record<string, number> }> {
  const includeAudit = Boolean(options.includeAudit);
  const clearList = includeAudit ? [...CLEARED_TABLES, AUDIT_TABLE] : [...CLEARED_TABLES];
  return db.$transaction(
    async (tx) => {
      // Uma operação de manutenção por vez: geração de dados fictícios e limpeza não se intercalam.
      await lockMaintenance(tx);
      if (options.expectedDatabase) {
        const [{ db: database }] = await tx.$queryRawUnsafe<{ db: string }[]>(`SELECT current_database() AS db`);
        if (database !== options.expectedDatabase) throw new ResetAbort("A conexão não aponta para o banco permitido.");
      }
      // Sem escritas concorrentes nas tabelas preservadas enquanto a operação roda. O TRUNCATE
      // já toma trava exclusiva nas tabelas limpas.
      await tx.$executeRawUnsafe(`LOCK TABLE "User", "ClinicSettings" IN SHARE ROW EXCLUSIVE MODE`);
      if (includeAudit) await tx.$executeRawUnsafe(`LOCK TABLE "${AUDIT_TABLE}" IN SHARE ROW EXCLUSIVE MODE`);
      const recheck = await inspectSchema(tx);
      if (recheck.length) throw new ResetAbort(`O banco mudou antes da execução: ${recheck.join(" ")}`);

      const before = await countTables(tx, clearList);
      const snapshot = { user: await fingerprint(tx, "User"), settings: await fingerprint(tx, "ClinicSettings") };

      // Lista fechada, sem CASCADE: as FKs entre as tabelas limpas (inclusive as cíclicas entre
      // revisões do plano e reavaliações) são resolvidas por estarem no mesmo TRUNCATE; qualquer
      // referência de fora faz o PostgreSQL recusar (RESTRICT).
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${CLEARED_TABLES.map(quote).join(", ")} RESTRICT`);

      if (includeAudit) {
        // Exceção pontual (só CLI): só a trigger de linha é desligada, nesta transação. A de TRUNCATE
        // continua ligada, e o DELETE é explícito.
        await tx.$executeRawUnsafe(`ALTER TABLE "${AUDIT_TABLE}" DISABLE TRIGGER "AuditLog_immutable_row"`);
        await tx.$executeRawUnsafe(`DELETE FROM "${AUDIT_TABLE}"`);
        await tx.$executeRawUnsafe(`ALTER TABLE "${AUDIT_TABLE}" ENABLE TRIGGER "AuditLog_immutable_row"`);
      }

      await options.hooks?.afterClear?.(tx);

      const after = await countTables(tx, clearList);
      const leftovers = Object.entries(after).filter(([, n]) => n !== 0);
      if (leftovers.length) throw new ResetAbort(`Tabelas não ficaram vazias: ${leftovers.map(([t]) => t).join(", ")}.`);
      const userAfter = await fingerprint(tx, "User");
      const settingsAfter = await fingerprint(tx, "ClinicSettings");
      if (userAfter.n !== snapshot.user.n || userAfter.h !== snapshot.user.h) {
        throw new ResetAbort("Os usuários mudaram durante a operação.");
      }
      if (settingsAfter.h !== snapshot.settings.h) throw new ResetAbort("As configurações mudaram durante a operação.");
      const protections = await inspectSchema(tx);
      if (protections.length) throw new ResetAbort(`Proteções alteradas: ${protections.join(" ")}`);

      if (options.actor) {
        const total = Object.values(before).reduce((sum, n) => sum + n, 0);
        // Client da transação: a auditoria entra no mesmo COMMIT da limpeza.
        await writeAudit(tx, {
          action: "BASE_REINICIADA",
          result: "SUCESSO",
          actorId: options.actor.id,
          actorRole: options.actor.role,
          ip: options.actor.ip,
          details: `Limpeza pela web (desenvolvimento): ${total} registro(s) em ${CLEARED_TABLES.length} tabelas; usuários, configurações e auditoria preservados.`,
        });
      }
      return { users: userAfter.n, cleared: after, before };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
