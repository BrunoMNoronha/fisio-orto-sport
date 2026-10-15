import { getAdministrativeReport } from "@/modules/administrativo/report-queries";
import { REPORT_TITLES, type AdministrativeReportKind } from "@/modules/administrativo/report-validation";
import { ReportSummary, ReportTables } from "@/app/(app)/administrativo/relatorios/report-view";
import { PrintButton } from "../../print-button";
export const dynamic = 'force-dynamic';
export default async function PrintReport({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { kind } = await params;
  const { report: r, error } = await getAdministrativeReport(kind as AdministrativeReportKind, await searchParams, 'all');
  return <main className="report-print mx-auto flex max-w-7xl flex-col gap-4 bg-white p-4 text-black"><h1 className="text-2xl font-semibold">Administrativo · {REPORT_TITLES[kind as AdministrativeReportKind] ?? 'Relatório inválido'}</h1>
    {error ? <p role="alert">{error}</p> : r && <><div className="print-controls"><PrintButton /></div><ReportSummary report={r} /><p>COMPLETO: {r.items.length} de {r.total} itens do filtro. Totais e itens obtidos na mesma posição do banco.</p><ReportTables report={r} /></>}
    <style>{`@media print { @page { size: A4 landscape; margin: 12mm; } html,body { background:white!important; color:black!important; } .print-controls { display:none!important; } .report-print { max-width:none; padding:0; font-size:9pt; } .report-table { overflow:visible!important; } .report-print table { width:100%; table-layout:fixed; font-size:8pt; } .report-print th,.report-print td { overflow-wrap:anywhere; padding:3px; } .report-print thead { display:table-header-group; } .report-print tr { break-inside:avoid; } .report-print h2 { break-after:avoid; } }`}</style>
  </main>;
}
