'use client';
import {useState} from 'react';
import {PatientCombobox} from '../../agenda/patient-combobox';
import {searchFinancialReportOptions} from '@/modules/administrativo/financial-report-actions';
import {FINANCIAL_OPTION_KEYS,FINANCIAL_OPTION_LABELS,type FinancialOptionKey} from '@/modules/administrativo/financial-report-fields';
import {FINANCIAL_AXES,BALANCE_FILTERS,type FinancialReportKind} from '@/modules/administrativo/financial-report-validation';
const searches=Object.fromEntries(FINANCIAL_OPTION_KEYS.map(key=>[key,searchFinancialReportOptions.bind(null,key)])) as Record<FinancialOptionKey,(query:string)=>ReturnType<typeof searchFinancialReportOptions>>;
function Selection({name,value,label}:{name:FinancialOptionKey;value:string|undefined;label:string|undefined}){
  const [selected,setSelected]=useState(value?{id:value,label:label??'Filtro informado (revise a seleção)'}:null);
  const title=FINANCIAL_OPTION_LABELS[name];
  return <div><PatientCombobox name={name} label={title} value={selected} onChange={setSelected} search={searches[name]} texts={{noun:title.toLowerCase(),plural:title,listLabel:title}}/>{selected&&<button type="button" className="text-sm underline" onClick={()=>setSelected(null)}>Remover {title.toLowerCase()}</button>}</div>;
}
export function FinancialFilters({kind,values,labels}:{kind:FinancialReportKind;values:Record<string,string|undefined>;labels:Record<string,string>}){
  return <form method="get" className="grid gap-4 rounded border p-4 sm:grid-cols-2 lg:grid-cols-3">
    {FINANCIAL_OPTION_KEYS.filter(key=>kind==='conciliacao'||['operatorId','contractId','batchId'].includes(key)).map(key=><Selection key={key+String(values[key])} name={key} value={values[key]} label={labels[key]}/>)}
    <label>Eixo temporal<select className="block w-full rounded border p-2" name="axis" defaultValue={values.axis??(kind==='faturamento'?'envio':'execucao')}>{Object.entries(FINANCIAL_AXES).filter(([key])=>kind==='conciliacao'||['envio','fechamento'].includes(key)).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label>Data inicial (inclusiva)<input className="block w-full rounded border p-2" type="date" name="start" min="2000-01-01" max="2100-12-31" defaultValue={values.start}/></label>
    <label>Data final (inclusiva)<input className="block w-full rounded border p-2" type="date" name="end" min="2000-01-01" max="2100-12-31" defaultValue={values.end}/></label>
    {kind==='faturamento'?<label>Estado do lote<select name="state" defaultValue={values.state??''} className="block w-full rounded border p-2"><option value="">Fechados e enviados</option><option value="FECHADO">Fechado, ainda não enviado</option><option value="ENVIADO">Enviado</option></select></label>:<label>Posição atual do item<select name="balance" defaultValue={values.balance??''} className="block w-full rounded border p-2"><option value="">Todos os itens do recorte</option>{Object.entries(BALANCE_FILTERS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
    <div className="flex items-end gap-4"><button type="submit" className="rounded border px-4 py-2">Aplicar filtros</button><a className="underline" href={'/administrativo/relatorios/'+kind}>Limpar filtros</a></div>
  </form>;
}
