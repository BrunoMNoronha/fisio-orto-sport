import {csvText} from './report-csv';
import {FINANCIAL_AMOUNTS,type FinancialReport} from './financial-report-read';
import {FINANCIAL_REPORT_TITLES,financialReportCriterion} from './financial-report-validation';
export function financialReportCsv(report:FinancialReport){
  if(report.error||report.items.length!==report.total)throw new Error('Exportação exige todo o filtro, sem truncamento.');
  const headers=['Tipo','Identificador','Operadora','Contrato','Lote ID','Lote número','Guia ID','Guia número','Produção ID','Paciente','Procedimento','Profissional','Primeira data do eixo','Última data do eixo','Estado','Linhas do relatório','Itens congelados','Guias do lote','Valor original do lote (centavos)','Faturado original (centavos)','Ajustes (centavos)','Faturado líquido (centavos)','Recebido atual (centavos)','Aberto atual (centavos)','Glosa em análise atual (centavos)','Baixa definitiva atual (centavos)','Recebimentos válidos no período (centavos; eixo recebimento)','Glosa original no período (centavos; eixo glosa)','Critério / metadado'];
  const lines:unknown[][]=[headers];
  const meta=(label:string,value:string)=>{const row:unknown[]=Array(headers.length).fill('');row[0]='META';row[headers.length-1]=label+': '+value;lines.push(row);};
  meta('Relatório',FINANCIAL_REPORT_TITLES[report.kind]);meta('Eixo e universo',financialReportCriterion(report.kind,report.filters.axis));meta('Consulta iniciada em',report.generatedAt.toISOString());meta('Completude',`${report.total} de ${report.total} linhas; limite ${report.limit}; posição atual`);
  for(const [key,value] of Object.entries(report.filters))if(key!=='page'&&value!==undefined)meta(key,report.labels[key]??String(value));
  const amountValues=(row:FinancialReport['items'][number]|FinancialReport['totals'][number])=>FINANCIAL_AMOUNTS.map(key=>key==='batchValue'&&report.kind!=='faturamento'||key==='periodReceived'&&report.filters.axis!=='recebimento'||key==='periodGlosed'&&report.filters.axis!=='glosa'?'':row[key]);
  for(const r of report.items)lines.push(['ITEM',r.id,r.operator,r.contract,r.batchId,r.batchNumber,r.guideId??'',r.guideNumber??'',r.productionId??'',r.patient,r.procedure,r.professional,r.date,r.lastDate,r.state,BigInt(1),r.itemCount,report.kind==='faturamento'?r.guideCount:'',...amountValues(r),'Posição atual do recorte']);
  for(const t of report.totals)lines.push(['TOTAL','',t.operator,t.contract,'','','','','','','','','','','',t.rowCount,t.itemCount,'',...amountValues(t),'Total integral do contrato no mesmo recorte']);
  return '\uFEFF'+lines.map(row=>row.map(value=>typeof value==='bigint'||typeof value==='number'?String(value):csvText(value==null?'':String(value))).join(';')).join('\r\n')+'\r\n';
}
