import { prisma } from "@/lib/db";
import { assertPermission, AuthorizationError } from "@/modules/auth/dal";
import { REPORT_KINDS, parseAdministrativeReportFilters, type AdministrativeReportKind } from "@/modules/administrativo/report-validation";
import { readAdministrativeReport } from "@/modules/administrativo/report-read";
import { administrativeReportCsv } from "@/modules/administrativo/report-csv";
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  try { await assertPermission('administrativo:ler'); } catch (e) { if (e instanceof AuthorizationError) return new Response('Acesso negado.', { status: 403, headers }); throw e; }
  const { kind } = await params; if (!REPORT_KINDS.includes(kind as AdministrativeReportKind)) return new Response('Relatório inválido.', { status: 404, headers });
  const parsed = parseAdministrativeReportFilters(kind, new URL(request.url).searchParams);
  if (parsed.error || !parsed.filters) return new Response(parsed.error ?? 'Filtros inválidos.', { status: 400, headers });
  const report = await readAdministrativeReport(prisma, kind as AdministrativeReportKind, parsed.filters, 'all');
  if (report.error) return new Response(report.error, { status: 422, headers });
  return new Response(administrativeReportCsv(report), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="administrativo-${kind}.csv"` } });
}
