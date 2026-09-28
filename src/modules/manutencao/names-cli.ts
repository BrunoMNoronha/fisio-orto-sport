// Núcleo do `pnpm db:normalizar-nomes` (prisma/normalize-names.ts), separado da entrada para ser
// testado sem terminal (issue #78). Adequa ao contrato de nomes (src/lib/names.ts) os nomes cadastrais
// já gravados:
// - User.name
// - Patient.fullName e Patient.guardianName
// - ClinicSettings.displayName e ClinicSettings.legalName
// Nunca toca snapshots de autoria dos registros clínicos, a auditoria nem qualquer outro campo, e
// não altera updatedAt, autoria da edição ou versão: é uma adequação técnica, não uma edição.
//
// Operação própria, nunca efeito colateral de leitura, deploy, reset ou geração de dados fictícios.
// Sem --executar, é só simulação: mostra alvo e contagens por campo e não escreve nada. Com
// --executar, pede o nome do banco. Tudo roda numa transação; cada linha só é atualizada se ainda
// tiver o valor lido (alteração concorrente aborta tudo). Idempotente: uma segunda execução não
// encontra nada a adequar. A saída nunca mostra nomes, só contagens.
import { parseArgs } from "node:util";
import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeName } from "@/lib/names";
import { describeTarget, type AdminCliIO } from "@/modules/auth/admin-cli";

export const NAMES_CLI_USAGE = "Uso: pnpm db:normalizar-nomes [--executar]";

// Tabela, coluna e tamanho máximo aceito depois de normalizar (o do formulário ou da coluna).
export const NAME_FIELDS = [
  { table: "User", column: "name", max: 120 },
  { table: "Patient", column: "fullName", max: 120 },
  { table: "Patient", column: "guardianName", max: 120 },
  { table: "ClinicSettings", column: "displayName", max: 120 },
  { table: "ClinicSettings", column: "legalName", max: 160 },
] as const;

export type NamesCliDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe" | "$transaction" | "$disconnect">;
type Tx = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

// Ponto de teste: roda dentro da transação, depois das atualizações e antes do COMMIT.
export type NamesHooks = { afterUpdate?: (tx: Tx) => Promise<void> };

class NamesAbort extends Error {}

type Pending = { table: string; column: string; id: string; from: string; to: string };

const label = (field: { table: string; column: string }) => `${field.table}.${field.column}`;

async function pending(db: Tx) {
  const items: Pending[] = [];
  const tooLong: string[] = [];
  for (const field of NAME_FIELDS) {
    const rows = await db.$queryRawUnsafe<{ id: string | number; value: string }[]>(
      `SELECT "id", "${field.column}" AS value FROM "${field.table}" WHERE "${field.column}" IS NOT NULL`,
    );
    for (const row of rows) {
      const to = normalizeName(row.value);
      if (to === row.value) continue;
      if (to.length > field.max) tooLong.push(label(field));
      items.push({ table: field.table, column: field.column, id: String(row.id), from: row.value, to });
    }
  }
  return { items, tooLong: [...new Set(tooLong)] };
}

function summary(io: AdminCliIO, items: Pending[]) {
  io.out("A adequar (linhas):");
  for (const field of NAME_FIELDS) {
    const n = items.filter((item) => item.table === field.table && item.column === field.column).length;
    io.out(`  ${label(field).padEnd(30)} ${n}`);
  }
}

// Devolve o código de saída do processo (0 = sucesso).
export async function runNamesCli(
  argv: string[],
  databaseUrl: string | undefined,
  io: AdminCliIO,
  openDb: (url: string) => NamesCliDb,
  hooks: NamesHooks = {},
): Promise<number> {
  let execute: boolean;
  try {
    const { values } = parseArgs({ args: argv, options: { executar: { type: "boolean" } } });
    execute = Boolean(values.executar);
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : String(error)}\n${NAMES_CLI_USAGE}`);
    return 1;
  }
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
    io.out("Escopo: nomes cadastrais. Snapshots clínicos de autoria e auditoria não são alterados.");

    const found = await pending(db);
    summary(io, found.items);
    if (found.tooLong.length) {
      io.err(`Nomes que passariam do limite depois de normalizar em: ${found.tooLong.join(", ")}. Corrija-os antes. Nada foi alterado.`);
      return 1;
    }
    if (found.items.length === 0) {
      io.out("Nada a adequar: todos os nomes já seguem o contrato.");
      return 0;
    }
    if (!execute) {
      io.out("Simulação concluída. Nada foi alterado. Para executar: pnpm db:normalizar-nomes --executar");
      return 0;
    }

    const typed = await io.ask(`Isto regrava ${found.items.length} nome(s) em ${target.label}. Digite o nome do banco ("${target.database}"): `);
    if (typed.trim() !== target.database) {
      io.err("Cancelado. Nada foi alterado.");
      return 1;
    }

    const total = await db.$transaction(
      async (tx) => {
        // Relido na transação: o que mudou desde a simulação também entra.
        const current = await pending(tx);
        if (current.tooLong.length) throw new NamesAbort(`Nomes acima do limite em: ${current.tooLong.join(", ")}.`);
        for (const item of current.items) {
          const updated = await tx.$executeRawUnsafe(
            `UPDATE "${item.table}" SET "${item.column}" = $1 WHERE "id"::text = $2 AND "${item.column}" = $3`,
            item.to,
            item.id,
            item.from,
          );
          if (updated !== 1) throw new NamesAbort("Um nome foi alterado durante a operação.");
        }
        await hooks.afterUpdate?.(tx);
        const left = await pending(tx);
        if (left.items.length) throw new NamesAbort("Restaram nomes fora do contrato.");
        return current.items.length;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    io.out(`Nomes adequados: ${total}. Uma nova execução não encontrará nada a alterar.`);
    return 0;
  } catch (error) {
    if (error instanceof NamesAbort) {
      io.err(`${error.message} A transação foi desfeita; nada foi alterado.`);
      return 1;
    }
    io.err(`Falha: ${error instanceof Error ? error.name : typeof error}. A transação foi desfeita; nada foi alterado.`);
    return 1;
  } finally {
    await db.$disconnect();
  }
}
