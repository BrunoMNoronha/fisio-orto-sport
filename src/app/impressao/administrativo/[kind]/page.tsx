import { getAdministrativeReport } from "@/modules/administrativo/report-queries";
import { REPORT_TITLES, type AdministrativeReportKind } from "@/modules/administrativo/report-validation";
import { ReportSummary, ReportTables } from "@/app/(app)/administrativo/relatorios/report-view";
import { PrintButton } from "../../print-button";
import {getFinancialReport} from '@/modules/administrativo/financial-report-queries';
import {isFinancialReportKind,FINANCIAL_REPORT_TITLES} from '@/modules/administrativo/financial-report-validation';
import {FinancialSummary,FinancialTables} from '@/app/(app)/administrativo/relatorios/financial-view';
export const dynamic = 'force-dynamic';
export default async function PrintReport({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { kind } = await params;
  const raw=await searchParams;
  if(isFinancialReportKind(kind)){
    const {report:r,error}=await getFinancialReport(kind,raw,'all');
    return <main className="report-print mx-auto flex max-w-7xl flex-col gap-4 bg-white p-4 text-black"><h1 className="text-2xl font-semibold">Administrativo · {FINANCIAL_REPORT_TITLES[kind]}</h1>{error?<p role="alert">{error}</p>:r&&<><div className="print-controls"><PrintButton/></div><FinancialSummary report={r}/><p>COMPLETO: {r.items.length} de {r.total} linhas do filtro. Totais e linhas obtidos na mesma posição do banco.</p><FinancialTables report={r}/></>}<style>{printStyles}</style></main>;
  }
  const { report: r, error } = await getAdministrativeReport(kind as AdministrativeReportKind, raw, 'all');
  return <main className="report-print mx-auto flex max-w-7xl flex-col gap-4 bg-white p-4 text-black"><h1 className="text-2xl font-semibold">Administrativo · {REPORT_TITLES[kind as AdministrativeReportKind] ?? 'Relatório inválido'}</h1>
    {error ? <p role="alert">{error}</p> : r && <><div className="print-controls"><PrintButton /></div><ReportSummary report={r} /><p>COMPLETO: {r.items.length} de {r.total} itens do filtro. Totais e itens obtidos na mesma posição do banco.</p><ReportTables report={r} /></>}
    <style>{printStyles}</style>
  </main>;
}
const printStyles=`@media print { @page { size: A4 landscape; margin: 12mm; } html,body { background:white!important; color:black!important; } .print-controls { display:none!important; } .report-print { max-width:none; padding:0; font-size:9pt; } .report-table { overflow:visible!important; } .report-print table { width:100%; table-layout:fixed; font-size:8pt; } .report-print th,.report-print td { overflow-wrap:anywhere; padding:3px; } .report-print thead { display:table-header-group; } .report-print tr { break-inside:avoid; } .report-print h2 { break-after:avoid; } }`;
