import {z} from 'zod';
import {parseCivilDate} from './catalog-validation';

export const FINANCIAL_REPORT_KINDS=['faturamento','conciliacao'] as const;
export type FinancialReportKind=typeof FINANCIAL_REPORT_KINDS[number];
export const FINANCIAL_REPORT_TITLES={faturamento:'Faturamento por lote e operadora',conciliacao:'Recebimentos e glosas por guia/item'};
export const FINANCIAL_AXES={execucao:'Data civil de execução (São Paulo)',fechamento:'Data civil de fechamento do lote (São Paulo)',envio:'Data civil do primeiro envio que constituiu a obrigação',recebimento:'Data efetiva de recebimento atualmente válido',glosa:'Data efetiva da glosa original registrada manualmente'};
export const BALANCE_FILTERS={COM_ABERTO:'Com saldo em aberto',COM_ANALISE:'Com glosa em análise',COM_BAIXA:'Com baixa definitiva',COM_RECEBIDO:'Com recebimento válido',SEM_RECUPERAVEL:'Sem aberto nem glosa em análise'};
const id=z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
const date=z.string().refine(value=>!!parseCivilDate(value),'Data civil inválida.');
const schema=z.object({operatorId:z.uuid().optional(),contractId:z.uuid().optional(),batchId:z.uuid().optional(),guideId:z.uuid().optional(),patientId:id.optional(),procedureId:z.uuid().optional(),professionalId:id.optional(),axis:z.enum(['execucao','fechamento','envio','recebimento','glosa']),start:date.optional(),end:date.optional(),state:z.enum(['FECHADO','ENVIADO']).optional(),balance:z.enum(['COM_ABERTO','COM_ANALISE','COM_BAIXA','COM_RECEBIDO','SEM_RECUPERAVEL']).optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict();
export type FinancialReportFilters=z.output<typeof schema>;
export function isFinancialReportKind(value:unknown):value is FinancialReportKind{return FINANCIAL_REPORT_KINDS.includes(value as FinancialReportKind);}
export function parseFinancialReportFilters(kind:unknown,raw:unknown){
  const fail=(error:string)=>({error,filters:null});
  if(!isFinancialReportKind(kind))return fail('Relatório inválido.');
  let entries:[string,unknown][];
  if(raw instanceof URLSearchParams){if([...raw.keys()].some(key=>raw.getAll(key).length!==1))return fail('Informe cada filtro apenas uma vez.');entries=[...raw.entries()];}
  else if(raw===undefined)entries=[];
  else if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&(Object.getPrototypeOf(raw)===Object.prototype||Object.getPrototypeOf(raw)===null))entries=Object.entries(raw);
  else return fail('Filtros inválidos.');
  const values:Record<string,unknown>={axis:kind==='faturamento'?'envio':'execucao'};
  for(const [key,value] of entries){if(value===undefined)continue;if(typeof value!=='string')return fail('Informe cada filtro uma vez, como texto.');if(key==='axis'&&!value.trim())continue;values[key]=value.trim()||undefined;}
  const parsed=schema.safeParse(values);if(!parsed.success)return fail('Filtros inválidos. Revise datas, identificadores, eixo e página.');
  const f=parsed.data;
  if(f.start&&f.end&&f.start>f.end)return fail('A data inicial não pode ser posterior à final.');
  if(f.patientId&&/^\d+$/.test(f.patientId))return fail('Selecione o paciente pelo nome; não informe CPF.');
  if(kind==='faturamento'&&(!['fechamento','envio'].includes(f.axis)||f.patientId||f.professionalId||f.procedureId||f.guideId||f.balance))return fail('Faturamento representa lotes inteiros. Use fechamento/envio e filtros de operadora, contrato, lote ou estado.');
  if(kind==='conciliacao'&&f.state)return fail('Acompanhamento contém somente itens enviados; use o filtro de saldo.');
  return {error:null,filters:f};
}
export function financialReportQuery(filters:FinancialReportFilters,page?:number){const q=new URLSearchParams();for(const [key,value] of Object.entries(filters))if(key!=='page'&&value!==undefined)q.set(key,String(value));if(page&&page>1)q.set('page',String(page));return q.toString();}
export function financialReportCriterion(kind:FinancialReportKind,axis:FinancialReportFilters['axis']){
  const cohort=axis==='recebimento'?'Itens com ao menos uma alocação de recebimento atualmente válida no período; estornados/substituídos não selecionam itens.':axis==='glosa'?'Itens com ao menos uma glosa original no período, inclusive glosas já liberadas, pagas ou baixadas.':kind==='faturamento'?'Lotes inteiros fechados/enviados; lote fechado é preparado e ainda não constitui faturamento.':'Itens enviados cuja data do eixo selecionado está no período.';
  return `${FINANCIAL_AXES[axis]}. ${cohort} Limites de data inclusivos. Valores de saldo são a posição atual completa do mesmo recorte, incluindo movimentos de outras datas; não são posição histórica de corte. Correções de envio não mudam a competência da obrigação original. Recebido de operadora não é receita contábil nem caixa consolidado com pacientes.`;
}
