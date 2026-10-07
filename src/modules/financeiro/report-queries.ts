import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { emptyReceivablesReport, emptyReceiptsReport, readReceivablesReport, readReceiptsReport } from "./report-read";
import { parseReportFilters } from "./report-validation";

// Autorização antes da validação e de qualquer leitura, inclusive quando chamadas diretamente.
export async function getReceivablesReport(raw: unknown, now?: Date) {
  await requirePermission("financeiro:ler");
  const parsed = parseReportFilters(raw);
  return parsed.error !== null ? emptyReceivablesReport(parsed.error) : readReceivablesReport(prisma, parsed.filters, now);
}

export async function getReceiptsReport(raw: unknown) {
  await requirePermission("financeiro:ler");
  const parsed = parseReportFilters(raw);
  return parsed.error !== null ? emptyReceiptsReport(parsed.error) : readReceiptsReport(prisma, parsed.filters);
}
