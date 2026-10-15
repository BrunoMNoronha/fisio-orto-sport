import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { parseAdministrativeReportFilters, type AdministrativeReportKind } from "./report-validation";
import { readAdministrativeReport, type ReportMode } from "./report-read";
export async function getAdministrativeReport(kind: AdministrativeReportKind, raw: unknown, mode: ReportMode = 'page') {
  await requirePermission('administrativo:ler');
  const parsed = parseAdministrativeReportFilters(kind, raw);
  if (parsed.error || !parsed.filters) return { error: parsed.error ?? 'Filtros inválidos.', report: null };
  const report = await readAdministrativeReport(prisma, kind, parsed.filters, mode);
  return { error: report.error, report };
}
