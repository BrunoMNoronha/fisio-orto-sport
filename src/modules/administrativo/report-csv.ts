import type { AdministrativeReport, AdministrativeReportRow } from "./report-read";
import { REPORT_TITLES, reportPeriod } from "./report-validation";
export function csvText(value: string) { const clean = value.replaceAll('\0', ''); const safe = /^[\s\u0000-\u001f\uFEFF]*[=+\-@]/u.test(clean) || /^[\t\r\n]/.test(clean) ? "'" + clean : clean; return '"' + safe.replaceAll('"', '""') + '"'; }
const cell = (value: unknown) => typeof value === 'bigint' || typeof value === 'number' ? String(value) : csvText(value == null ? '' : String(value));
export function administrativeReportCsv(report: AdministrativeReport) {
  if (report.error) throw new Error('Relatório incompleto não pode ser exportado.');
  if (report.items.length !== report.total) throw new Error('Exportação exige todos os itens do filtro.');
  const headers = ['Tipo', 'Data inicial/execução', 'Data final', 'Paciente', 'Operadora', 'Contrato', 'Profissional', 'Tabela', 'Código', 'Procedimento', 'Estado', 'Pendência', 'Autorização', 'Itens', 'Quantidade', 'Autorizado', 'Consumido', 'Disponível', 'Valor conferido (centavos)', 'Observação'];
  const lines: unknown[][] = [headers];
  const metadata = (label: string, value: string) => { lines.push(['META', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', label + ': ' + value]); };
  metadata('Relatório', REPORT_TITLES[report.kind]); metadata('Eixo', reportPeriod(report.kind)); metadata('Gerado em', report.generatedAt.toISOString()); metadata('Completude', `${report.total} de ${report.total} itens; limite ${report.limit}; posição atual`);
  for (const [key, value] of Object.entries(report.filters)) if (key !== 'page' && value !== undefined) metadata(key, report.labels[key] ?? String(value));
  const data = (r: Partial<AdministrativeReportRow>, type: string, count?: bigint) => [type, r.date ?? '', r.end ?? '', r.patient ?? '', r.operator ?? '', r.contract ?? '', r.professional ?? '', r.tableCode ?? '', r.code ?? '', r.procedure ?? '', r.state ?? '', r.hasPending ? 'Sim' : 'Não', r.authorization ?? '', count ?? '', r.quantity ?? '', r.authorized ?? '', r.consumed ?? '', r.available ?? '', r.amountCents ?? '', r.reason ?? ''];
  for (const row of report.items) lines.push(data(row, 'ITEM'));
  for (const total of report.totals) lines.push(data(total, 'TOTAL', total.count));
  return '\uFEFF' + lines.map(line => line.map(cell).join(';')).join('\r\n') + '\r\n';
}
