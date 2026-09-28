// Núcleo do `pnpm db:reset` (prisma/reset.ts), separado da entrada para ser testado sem terminal
// (issue #62). Reinicializa os dados do banco de DATABASE_URL preservando TODOS os usuários; as regras de
// dados, a transação e as conferências ficam em reset.ts, compartilhado com a ação web da aba
// Desenvolvimento (#78).
// Sem --executar, é só simulação: mostra alvo, escopo e contagens e não escreve nada. Com
// --executar, pede o nome do banco e a palavra LIMPAR. A auditoria só é apagada com
// --incluir-auditoria (exceção A5/A7, exclusiva da CLI). A URL do banco nunca é impressa (só host e
// nome), e nenhum dado pessoal, clínico ou hash aparece na saída.
import { parseArgs } from "node:util";
import type { PrismaClient } from "@/generated/prisma/client";
import { describeTarget, type AdminCliIO } from "@/modules/auth/admin-cli";
import { ResetAbort, executeReset, previewReset, type ResetHooks } from "./reset";

export { AUDIT_TABLE, CLEARED_TABLES, PRESERVED_TABLES, inspectSchema, type ResetHooks } from "./reset";

export const RESET_CLI_USAGE = "Uso: pnpm db:reset [--executar] [--incluir-auditoria]";

export type ResetCliDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe" | "$transaction" | "$disconnect">;

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

    const preview = await previewReset(db, includeAudit);
    if (preview.problems.length) {
      io.err(`O banco não corresponde ao previsto. Nada foi alterado.\n${preview.problems.map((p) => `- ${p}`).join("\n")}`);
      return 1;
    }
    table(io, "Preservar (linhas):", preview.keep);
    table(io, "Limpar (linhas):", preview.clear);
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

    const result = await executeReset(db, { includeAudit, hooks });

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
