// Núcleo do `pnpm db:reset` (prisma/reset.ts), separado da entrada para ser testado sem terminal
// (issue #62). Reinicializa os dados do banco de DATABASE_URL preservando TODOS os usuários:
// - Preserva `User` (todas as linhas e campos, inclusive hashes, datas e inativos), `ClinicSettings`
//   e `_prisma_migrations`; o schema, índices, constraints, funções e triggers não são tocados.
// - Limpa pacientes, agenda (inclusive bloqueios), prontuário, sessões de login e limites de login.
// - A auditoria (`AuditLog`) só é apagada com --incluir-auditoria: exceção à imutabilidade (A7) e à
//   retenção (A5), decidida na hora da execução. Nesse caso só a trigger de linha é desligada, dentro
//   da mesma transação, e religada antes do COMMIT (em falha, o ROLLBACK desfaz também isso).
// Sem --executar, é só simulação: mostra alvo, escopo e contagens e não escreve nada. Com
// --executar, pede o nome do banco e a palavra LIMPAR. Tudo roda numa transação: qualquer falha,
// inclusive nas conferências finais (tabelas vazias, usuários idênticos, triggers ligadas), desfaz
// tudo. Tabela ou dependência fora do previsto aborta antes de qualquer escrita. A URL do banco
// nunca é impressa (só host e nome), e nenhum dado pessoal, clínico ou hash aparece na saída.
import { parseArgs } from "node:util";
import type { PrismaClient } from "@/generated/prisma/client";
import { describeTarget, type AdminCliIO } from "@/modules/auth/admin-cli";

export const RESET_CLI_USAGE = "Uso: pnpm db:reset [--executar] [--incluir-auditoria]";

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
const AUDIT_TRIGGERS = ["AuditLog_immutable_row", "AuditLog_no_truncate"] as const;
const KNOWN_TABLES = new Set<string>([...PRESERVED_TABLES, ...CLEARED_TABLES, AUDIT_TABLE]);

export type ResetCliDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe" | "$transaction" | "$disconnect">;
type Tx = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

// Ponto de teste: roda dentro da transação, depois da limpeza e antes das conferências.
export type ResetHooks = { afterClear?: (tx: Tx) => Promise<void> };

export class ResetAbort extends Error {}

const quote = (table: string) => `"${table.replace(/"/g, '""')}"`;

async function count(db: Tx, table: string) {
  const [row] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${quote(table)}`);
  return row.n;
}

// Impressão digital de todas as linhas e colunas de uma tabela preservada. Só é comparada, nunca
// impressa (inclui hashes de senha).
async function fingerprint(db: Tx, table: string) {
  const [row] = await db.$queryRawUnsafe<{ n: number; h: string }[]>(
    `SELECT count(*)::int AS n, coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), '') AS h FROM ${quote(table)} t`,
  );
  return row;
}

// Confere que o banco é exatamente o previsto: tabelas, dependências e as triggers da auditoria.
export async function inspectSchema(db: Tx): Promise<string[]> {
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

async function counts(db: Tx, tables: readonly string[]) {
  const result: Record<string, number> = {};
  for (const table of tables) result[table] = await count(db, table);
  return result;
}

function table(io: AdminCliIO, title: string, values: Record<string, number>) {
  io.out(title);
  for (const [name, n] of Object.entries(values)) io.out(`  ${name.padEnd(24)} ${n}`);
}

// Devolve o código de saída do processo (0 = sucesso).
export async function runResetCli(
  argv: string[],
  databaseUrl: string | undefined,
  io: AdminCliIO,
  openDb: (url: string) => ResetCliDb,
  hooks: ResetHooks = {},
): Promise<number> {
  let values: { executar?: boolean; "incluir-auditoria"?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { executar: { type: "boolean" }, "incluir-auditoria": { type: "boolean" } },
    }));
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : String(error)}\n${RESET_CLI_USAGE}`);
    return 1;
  }
  const execute = Boolean(values.executar);
  const includeAudit = Boolean(values["incluir-auditoria"]);

  if (!databaseUrl) {
    io.err("DATABASE_URL não definida.");
    return 1;
  }
  const target = describeTarget(databaseUrl);
  if (!target) {
    io.err("DATABASE_URL inválida (o valor não é exibido).");
    return 1;
  }

  const db = openDb(databaseUrl);
  try {
    io.out(`Banco: ${target.label}${target.local ? " (local)" : " (REMOTO)"}`);
    io.out(execute ? "Modo: EXECUÇÃO" : "Modo: simulação (nada será alterado)");

    const problems = await inspectSchema(db);
    if (problems.length) {
      io.err(`O banco não corresponde ao previsto. Nada foi alterado.\n${problems.map((p) => `- ${p}`).join("\n")}`);
      return 1;
    }

    const clearList = includeAudit ? [...CLEARED_TABLES, AUDIT_TABLE] : [...CLEARED_TABLES];
    const keepList = includeAudit ? [...PRESERVED_TABLES] : [...PRESERVED_TABLES, AUDIT_TABLE];
    table(io, "Preservar (linhas):", await counts(db, keepList));
    table(io, "Limpar (linhas):", await counts(db, clearList));
    io.out(
      includeAudit
        ? "Auditoria: os eventos anteriores SERÃO APAGADOS (exceção às regras A5/A7; registre a autorização)."
        : "Auditoria: preservada (use --incluir-auditoria para apagar os eventos anteriores).",
    );

    if (!execute) {
      io.out("Simulação concluída. Nada foi alterado. Para executar: pnpm db:reset --executar");
      return 0;
    }

    const typedDatabase = await io.ask(
      `Isto apaga definitivamente os dados listados em ${target.label}. Digite o nome do banco ("${target.database}"): `,
    );
    if (typedDatabase.trim() !== target.database) {
      io.err("Cancelado. Nada foi alterado.");
      return 1;
    }
    const typedWord = await io.ask('Confirme digitando LIMPAR: ');
    if (typedWord.trim() !== "LIMPAR") {
      io.err("Cancelado. Nada foi alterado.");
      return 1;
    }

    const result = await db.$transaction(
      async (tx) => {
        // Sem escritas concorrentes nas tabelas preservadas enquanto a operação roda. O TRUNCATE
        // já toma trava exclusiva nas tabelas limpas.
        await tx.$executeRawUnsafe(`LOCK TABLE "User", "ClinicSettings" IN SHARE ROW EXCLUSIVE MODE`);
        if (includeAudit) await tx.$executeRawUnsafe(`LOCK TABLE "${AUDIT_TABLE}" IN SHARE ROW EXCLUSIVE MODE`);
        const recheck = await inspectSchema(tx);
        if (recheck.length) throw new ResetAbort(`O banco mudou antes da execução: ${recheck.join(" ")}`);

        const before = { user: await fingerprint(tx, "User"), settings: await fingerprint(tx, "ClinicSettings") };

        // Lista fechada, sem CASCADE: as FKs entre as tabelas limpas (inclusive as cíclicas entre
        // revisões do plano e reavaliações) são resolvidas por estarem no mesmo TRUNCATE; qualquer
        // referência de fora faz o PostgreSQL recusar (RESTRICT).
        await tx.$executeRawUnsafe(`TRUNCATE TABLE ${CLEARED_TABLES.map(quote).join(", ")} RESTRICT`);

        if (includeAudit) {
          // Exceção pontual: só a trigger de linha é desligada, nesta transação. A de TRUNCATE
          // continua ligada, e o DELETE é explícito.
          await tx.$executeRawUnsafe(`ALTER TABLE "${AUDIT_TABLE}" DISABLE TRIGGER "AuditLog_immutable_row"`);
          await tx.$executeRawUnsafe(`DELETE FROM "${AUDIT_TABLE}"`);
          await tx.$executeRawUnsafe(`ALTER TABLE "${AUDIT_TABLE}" ENABLE TRIGGER "AuditLog_immutable_row"`);
        }

        await hooks.afterClear?.(tx);

        const after = await counts(tx, clearList);
        const leftovers = Object.entries(after).filter(([, n]) => n !== 0);
        if (leftovers.length) throw new ResetAbort(`Tabelas não ficaram vazias: ${leftovers.map(([t]) => t).join(", ")}.`);
        const userAfter = await fingerprint(tx, "User");
        const settingsAfter = await fingerprint(tx, "ClinicSettings");
        if (userAfter.n !== before.user.n || userAfter.h !== before.user.h) {
          throw new ResetAbort("Os usuários mudaram durante a operação.");
        }
        if (settingsAfter.h !== before.settings.h) throw new ResetAbort("As configurações mudaram durante a operação.");
        const protections = await inspectSchema(tx);
        if (protections.length) throw new ResetAbort(`Proteções alteradas: ${protections.join(" ")}`);
        return { users: userAfter.n, cleared: after };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    table(io, "Depois (linhas):", result.cleared);
    io.out(`Usuários preservados: ${result.users} (todas as linhas e campos idênticos aos de antes).`);
    io.out("Configurações e histórico de migrações preservados. Triggers de auditoria conferidas e ligadas.");
    io.out("Sessões anteriores encerradas: todos precisam entrar de novo. Nenhum seed foi executado.");
    return 0;
  } catch (error) {
    if (error instanceof ResetAbort) {
      io.err(`${error.message} A transação foi desfeita; nada foi alterado.`);
      return 1;
    }
    io.err(
      `Falha: ${error instanceof Error ? error.name : typeof error}. A transação foi desfeita; nada foi alterado.`,
    );
    return 1;
  } finally {
    await db.$disconnect();
  }
}
