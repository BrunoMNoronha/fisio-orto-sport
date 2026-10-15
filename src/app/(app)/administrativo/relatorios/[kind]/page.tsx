import Link from "next/link";
import { getAdministrativeReport } from "@/modules/administrativo/report-queries";
import { REPORT_KINDS, REPORT_TITLES, administrativeReportQuery, type AdministrativeReportKind } from "@/modules/administrativo/report-validation";
import { ReportFilters } from "../report-filters";
import { ReportSummary, ReportTables } from "../report-view";
export default async function ReportPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { kind } = await params, raw = await searchParams;
  const result = await getAdministrativeReport(kind as AdministrativeReportKind, raw);
  const r = result.report;
  const valid = REPORT_KINDS.includes(kind as AdministrativeReportKind);
  const values = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-5"><h1 className="text-2xl font-semibold">{valid ? REPORT_TITLES[kind as AdministrativeReportKind] : 'Relatório inválido'}</h1>
    <nav aria-label="Relatórios administrativos" className="flex flex-wrap gap-4">{REPORT_KINDS.map(k => <Link className="underline" aria-current={k === kind ? 'page' : undefined} href={`/administrativo/relatorios/${k}`} key={k}>{REPORT_TITLES[k]}</Link>)}</nav>
    <p>Cada relatório possui filtros próprios. Ao trocar de relatório, selecione novamente o período e os filtros.</p>
    {valid && <ReportFilters kind={kind as AdministrativeReportKind} values={values} labels={r?.labels ?? {}} />}
    {result.error && <p role="alert">{result.error}</p>}
    {r && !r.error && <><ReportSummary report={r} /><div className="flex flex-wrap gap-4"><a className="underline" href={`/administrativo/relatorios/${kind}/csv?${administrativeReportQuery(r.filters)}`}>Baixar CSV completo</a><Link className="underline" href={`/impressao/administrativo/${kind}?${administrativeReportQuery(r.filters)}`}>Impressão completa / PDF</Link></div><ReportTables report={r} />
      <nav aria-label="Paginação" className="flex gap-4">{r.page > 1 && <Link className="underline" href={`?${administrativeReportQuery(r.filters, r.page - 1)}`}>Anterior</Link>}<span>Página {r.page} de {r.pages}; {r.items.length} itens exibidos de {r.total}.</span>{r.page < r.pages && <Link className="underline" href={`?${administrativeReportQuery(r.filters, r.page + 1)}`}>Próxima</Link>}</nav></>}
  </div>;
}
