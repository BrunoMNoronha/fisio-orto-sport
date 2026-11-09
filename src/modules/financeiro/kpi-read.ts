// Indicadores financeiros da página inicial, sem sessão: compartilhado com a DAL autenticada e com
// testes PostgreSQL descartáveis. Uma única consulta = um único snapshot, sem transação.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { monthOf, monthWindow, previousMonth } from "./kpi-math";
import { todayInSaoPaulo } from "./payment-validation";

type Db = Pick<PrismaClient, "$queryRaw">;

export type FinanceKpis = {
  today: string;
  month: string;
  previousMonth: string;
  // Cobranças ATIVAS com vencimento no mês (pagas ou não).
  chargedCents: bigint;
  previousChargedCents: bigint;
  // Pagamentos sem estorno, pela data efetiva do recebimento.
  receivedCents: bigint;
  previousReceivedCents: bigint;
  // Saldo em aberto das cobranças ATIVAS, sem recorte de mês.
  openCents: bigint;
  // Parte do saldo em aberto com vencimento anterior a hoje em America/Sao_Paulo.
  overdueCents: bigint;
};

type Row = {
  chargedCents: string;
  previousChargedCents: string;
  openCents: string;
  overdueCents: string;
  receivedCents: string;
  previousReceivedCents: string;
};

export async function readFinanceKpis(db: Db, now?: Date): Promise<FinanceKpis> {
  const today = todayInSaoPaulo(now);
  const month = monthOf(today);
  const previous = previousMonth(month);
  const { start, next } = monthWindow(month);
  const { start: previousStart } = monthWindow(previous);

  // Mesma semântica de report-read.ts: pagamentos agregados por cobrança antes do saldo, para
  // nenhum join multiplicar o cobrado. Totais em texto → BigInt, nunca Number.
  const [row] = await db.$queryRaw<Row[]>(Prisma.sql`WITH receivables AS (
      SELECT c."dueDate", c."amountCents"::bigint AS "amountCents",
        c."amountCents"::bigint - COALESCE(paid.received, 0) AS "balanceCents"
      FROM "Charge" c
      LEFT JOIN LATERAL (
        SELECT SUM(p."amountCents") AS received FROM "Payment" p
        WHERE p."chargeId" = c."id"
          AND NOT EXISTS (SELECT 1 FROM "PaymentReversal" r WHERE r."paymentId" = p."id")
      ) paid ON TRUE
      WHERE c."status" = 'ATIVA'
    ), charges AS (
      SELECT
        COALESCE(SUM("amountCents") FILTER (WHERE "dueDate" >= ${start}::date AND "dueDate" < ${next}::date), 0)::text AS "chargedCents",
        COALESCE(SUM("amountCents") FILTER (WHERE "dueDate" >= ${previousStart}::date AND "dueDate" < ${start}::date), 0)::text AS "previousChargedCents",
        COALESCE(SUM("balanceCents") FILTER (WHERE "balanceCents" > 0), 0)::text AS "openCents",
        COALESCE(SUM("balanceCents") FILTER (WHERE "balanceCents" > 0 AND "dueDate" < ${today}::date), 0)::text AS "overdueCents"
      FROM receivables
    ), receipts AS (
      SELECT
        COALESCE(SUM(p."amountCents") FILTER (WHERE p."receivedOn" >= ${start}::date), 0)::text AS "receivedCents",
        COALESCE(SUM(p."amountCents") FILTER (WHERE p."receivedOn" < ${start}::date), 0)::text AS "previousReceivedCents"
      FROM "Payment" p
      WHERE p."receivedOn" >= ${previousStart}::date AND p."receivedOn" < ${next}::date
        AND NOT EXISTS (SELECT 1 FROM "PaymentReversal" r WHERE r."paymentId" = p."id")
    )
    SELECT charges."chargedCents", charges."previousChargedCents", charges."openCents", charges."overdueCents",
      receipts."receivedCents", receipts."previousReceivedCents"
    FROM charges CROSS JOIN receipts`);

  return {
    today,
    month,
    previousMonth: previous,
    chargedCents: BigInt(row.chargedCents),
    previousChargedCents: BigInt(row.previousChargedCents),
    receivedCents: BigInt(row.receivedCents),
    previousReceivedCents: BigInt(row.previousReceivedCents),
    openCents: BigInt(row.openCents),
    overdueCents: BigInt(row.overdueCents),
  };
}
