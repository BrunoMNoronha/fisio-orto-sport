// Leituras FIN-03 sem sessão: compartilhadas com a DAL autenticada e testes PostgreSQL descartáveis.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { todayInSaoPaulo } from "./payment-validation";
import { REPORT_MESSAGES, REPORT_PAGE_SIZE, type ReportFilters } from "./report-validation";
export type { ReportFilters } from "./report-validation";

type Db = Pick<PrismaClient, "$transaction">;
type Tx = Prisma.TransactionClient;
export type ReportPatient = { id: string; fullName: string; status: "ATIVO" | "INATIVO" };
export const REPORT_PATIENT_SELECT = { id: true, fullName: true, status: true } as const;

export type ReceivableReportItem = {
  id: string; description: string; dueDate: Date; patient: ReportPatient;
  amountCents: bigint; receivedCents: bigint; balanceCents: bigint; overdue: boolean;
};
export type ReceiptReportItem = {
  id: string; chargeId: string; receivedOn: Date; amountCents: bigint;
  patient: ReportPatient; description: string; replacesPaymentId: string | null;
};
export type ReceivablesTotals = { chargedCents: bigint; receivedCents: bigint; balanceCents: bigint; overdueCents: bigint };
export type ReceiptsTotals = { receivedCents: bigint };
type ReportResult<Item, Totals> = {
  error: string | null; filters: ReportFilters | null; patient: ReportPatient | null;
  items: Item[]; total: number; page: number; pageCount: number; pageSize: number; totals: Totals;
};
export type ReceivablesReport = ReportResult<ReceivableReportItem, ReceivablesTotals>;
export type ReceiptsReport = ReportResult<ReceiptReportItem, ReceiptsTotals>;

function emptyReport(error: string, filters: ReportFilters | null) {
  return { error, filters, patient: null, items: [], total: 0, page: 1, pageCount: 1, pageSize: REPORT_PAGE_SIZE };
}
export function emptyReceivablesReport(error: string, filters: ReportFilters | null = null): ReceivablesReport {
  return { ...emptyReport(error, filters), totals: { chargedCents: BigInt(0), receivedCents: BigInt(0), balanceCents: BigInt(0), overdueCents: BigInt(0) } };
}
export function emptyReceiptsReport(error: string, filters: ReportFilters | null = null): ReceiptsReport {
  return { ...emptyReport(error, filters), totals: { receivedCents: BigInt(0) } };
}

function filtersSql(filters: ReportFilters, dateColumn: Prisma.Sql) {
  const conditions: Prisma.Sql[] = [];
  if (filters.patientId) conditions.push(Prisma.sql`c."patientId" = ${filters.patientId}`);
  if (filters.start) conditions.push(Prisma.sql`${dateColumn} >= ${filters.start}::date`);
  if (filters.end) conditions.push(Prisma.sql`${dateColumn} <= ${filters.end}::date`);
  return conditions;
}

function receivablesSql(filters: ReportFilters) {
  const conditions = [Prisma.sql`c."status" = 'ATIVA'`, ...filtersSql(filters, Prisma.sql`c."dueDate"`)];
  // Agrega os recebimentos por cobrança antes de calcular saldo. Nenhum join multiplica o cobrado.
  return Prisma.sql`WITH receivables AS (
    SELECT c."id", c."patientId", c."description", c."dueDate", c."createdAt",
      c."amountCents"::bigint AS "amountCents",
      COALESCE(paid.received, 0)::bigint AS "receivedCents",
      c."amountCents"::bigint - COALESCE(paid.received, 0) AS "balanceCents"
    FROM "Charge" c
    LEFT JOIN LATERAL (
      SELECT SUM(p."amountCents") AS received FROM "Payment" p
      WHERE p."chargeId" = c."id"
        AND NOT EXISTS (SELECT 1 FROM "PaymentReversal" r WHERE r."paymentId" = p."id")
    ) paid ON TRUE
    WHERE ${Prisma.join(conditions, " AND ")}
  )`;
}

function receiptsSql(filters: ReportFilters) {
  const conditions = [
    Prisma.sql`NOT EXISTS (SELECT 1 FROM "PaymentReversal" r WHERE r."paymentId" = p."id")`,
    ...filtersSql(filters, Prisma.sql`p."receivedOn"`),
  ];
  return Prisma.sql`FROM "Payment" p JOIN "Charge" c ON c."id" = p."chargeId"
    WHERE ${Prisma.join(conditions, " AND ")}`;
}

async function filteredPatient(tx: Tx, filters: ReportFilters) {
  return filters.patientId
    ? tx.patient.findUnique({ where: { id: filters.patientId }, select: REPORT_PATIENT_SELECT })
    : null;
}

function pagination(total: number, requested: number) {
  const pageCount = Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE));
  const normalized = Number.isSafeInteger(requested) && requested >= 1 && requested <= 10_000 ? requested : 1;
  const page = Math.min(normalized, pageCount);
  return { page, pageCount, pageSize: REPORT_PAGE_SIZE, skip: (page - 1) * REPORT_PAGE_SIZE };
}

type PatientColumns = { patientId: string; fullName: string; patientStatus: ReportPatient["status"] };
function patientDto(row: PatientColumns): ReportPatient {
  return { id: row.patientId, fullName: row.fullName, status: row.patientStatus };
}

export async function readReceivablesReport(db: Db, filters: ReportFilters, now?: Date): Promise<ReceivablesReport> {
  const today = todayInSaoPaulo(now);
  return db.$transaction(async (tx) => {
    const patient = await filteredPatient(tx, filters);
    if (filters.patientId && !patient) return emptyReceivablesReport(REPORT_MESSAGES.patientNotFound, filters);
    const source = receivablesSql(filters);
    const [aggregate] = await tx.$queryRaw<{
      total: bigint; chargedCents: string; receivedCents: string; balanceCents: string; overdueCents: string;
    }[]>(Prisma.sql`${source}
      SELECT COUNT(*)::bigint AS total,
        COALESCE(SUM("amountCents"), 0)::text AS "chargedCents",
        COALESCE(SUM("receivedCents"), 0)::text AS "receivedCents",
        COALESCE(SUM("balanceCents"), 0)::text AS "balanceCents",
        COALESCE(SUM("balanceCents") FILTER (WHERE "dueDate" < ${today}::date), 0)::text AS "overdueCents"
      FROM receivables WHERE "balanceCents" > 0`);
    const total = Number(aggregate.total);
    const { skip, ...pages } = pagination(total, filters.page);
    const rows = await tx.$queryRaw<(Omit<ReceivableReportItem, "patient"> & PatientColumns)[]>(Prisma.sql`${source}
      SELECT c."id", c."description", c."dueDate", c."amountCents", c."receivedCents", c."balanceCents",
        c."dueDate" < ${today}::date AS overdue,
        patient."id" AS "patientId", patient."fullName", patient."status"::text AS "patientStatus"
      FROM receivables c JOIN "Patient" patient ON patient."id" = c."patientId"
      WHERE c."balanceCents" > 0
      ORDER BY c."dueDate" ASC, c."createdAt" ASC, c."id" ASC
      LIMIT ${REPORT_PAGE_SIZE} OFFSET ${skip}`);
    return {
      error: null, filters, patient, total, ...pages,
      items: rows.map((row) => ({
        id: row.id, description: row.description, dueDate: row.dueDate, patient: patientDto(row),
        amountCents: row.amountCents, receivedCents: row.receivedCents, balanceCents: row.balanceCents, overdue: row.overdue,
      })),
      totals: {
        chargedCents: BigInt(aggregate.chargedCents), receivedCents: BigInt(aggregate.receivedCents),
        balanceCents: BigInt(aggregate.balanceCents), overdueCents: BigInt(aggregate.overdueCents),
      },
    };
  }, { isolationLevel: "RepeatableRead" });
}

export async function readReceiptsReport(db: Db, filters: ReportFilters): Promise<ReceiptsReport> {
  return db.$transaction(async (tx) => {
    const patient = await filteredPatient(tx, filters);
    if (filters.patientId && !patient) return emptyReceiptsReport(REPORT_MESSAGES.patientNotFound, filters);
    const source = receiptsSql(filters);
    const [aggregate] = await tx.$queryRaw<{ total: bigint; receivedCents: string }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total, COALESCE(SUM(p."amountCents"), 0)::text AS "receivedCents" ${source}`);
    const total = Number(aggregate.total);
    const { skip, ...pages } = pagination(total, filters.page);
    const rows = await tx.$queryRaw<(Omit<ReceiptReportItem, "patient"> & PatientColumns)[]>(Prisma.sql`
      SELECT p."id", p."chargeId", p."receivedOn", p."amountCents"::bigint AS "amountCents", p."replacesPaymentId",
        c."description", patient."id" AS "patientId", patient."fullName", patient."status"::text AS "patientStatus"
      FROM "Payment" p JOIN "Charge" c ON c."id" = p."chargeId"
      JOIN "Patient" patient ON patient."id" = c."patientId"
      WHERE ${Prisma.join([
        Prisma.sql`NOT EXISTS (SELECT 1 FROM "PaymentReversal" r WHERE r."paymentId" = p."id")`,
        ...filtersSql(filters, Prisma.sql`p."receivedOn"`),
      ], " AND ")}
      ORDER BY p."receivedOn" DESC, p."createdAt" DESC, p."id" DESC
      LIMIT ${REPORT_PAGE_SIZE} OFFSET ${skip}`);
    return {
      error: null, filters, patient, total, ...pages,
      items: rows.map((row) => ({
        id: row.id, chargeId: row.chargeId, receivedOn: row.receivedOn, amountCents: row.amountCents,
        patient: patientDto(row), description: row.description, replacesPaymentId: row.replacesPaymentId,
      })),
      totals: { receivedCents: BigInt(aggregate.receivedCents) },
    };
  }, { isolationLevel: "RepeatableRead" });
}
