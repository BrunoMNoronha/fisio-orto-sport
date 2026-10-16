"use client";
import { HelpLabel, NativeActionButton } from "@/components/informative-help";
import {useActionState,useId,useState} from 'react';
import {saveSettlementAction} from '@/modules/administrativo/settlement-actions';
import {SETTLEMENT_KINDS,SETTLEMENT_LABELS,parseSettlementMoney} from '@/modules/administrativo/settlement-validation';
import {formatBRL} from '@/modules/financeiro/validation';

type Line={key:number;receivableId:string;glosaRootId:string;amount:string;code:string};
type Candidate={id:string;label:string};
type Glosa={id:string;receivableId:string;label:string};
type Source={id:string;amount:string;lines:Omit<Line,'key'|'code'>[]};
export function SettlementForm({id,requestId,contractId,today,candidates=[],glosas=[],source}:{id:string;requestId:string;contractId:string;today:string;candidates?:Candidate[];glosas?:Glosa[];source?:Source}){
  const [state,action,pending]=useActionState(saveSettlementAction,undefined);
  const [identity]=useState({id,requestId,contractId});
  const [kind,setKind]=useState<typeof SETTLEMENT_KINDS[number]>(source?'ESTORNAR':'RECEBER');
  const [amount,setAmount]=useState(source?.amount??'');
  const [lines,setLines]=useState<Line[]>(source?source.lines.map((line,key)=>({...line,key,code:''})):[{key:0,receivableId:candidates[0]?.id??'',glosaRootId:'',amount:'',code:''}]);
  const [nextKey,setNextKey]=useState(lines.length);
  const prefix=useId(),total=lines.reduce((sum,line)=>sum+(parseSettlementMoney(line.amount)??BigInt("0")),BigInt("0"));
  function update(key:number,patch:Partial<Line>){setLines(current=>current.map(line=>line.key===key?{...line,...patch}:line));}
  function changeKind(value:typeof kind){setKind(value);setLines(current=>current.map(line=>({...line,code:'',glosaRootId:['GLOSAR','AJUSTAR'].includes(value)?'':line.glosaRootId})));if(value==='ESTORNAR')setAmount(source?.amount??'');}
  return <form action={action} className="space-y-4 rounded border p-4">
    <fieldset disabled={pending} className="space-y-4"><legend className="font-semibold">{source?'Estornar ou substituir este recebimento':'Registrar conciliação'}</legend>
      <input type="hidden" name="id" value={identity.id}/><input type="hidden" name="requestId" value={identity.requestId}/><input type="hidden" name="contractId" value={identity.contractId}/><input type="hidden" name="reversesId" value={source?.id??''}/>
      <input type="hidden" name="lines" value={JSON.stringify(kind==='ESTORNAR'?[]:lines.map(({receivableId,glosaRootId,amount,code})=>({receivableId,glosaRootId,amount,code})))}/>
      <div className="grid gap-3 sm:grid-cols-2">
        <HelpLabel help="Escolha o tipo de movimento financeiro a registrar na conciliação." className="grid gap-1">Operação<select name="kind" value={kind} onChange={event=>changeKind(event.target.value as typeof kind)} className="rounded border p-2">{(source?(['ESTORNAR','SUBSTITUIR'] as const):SETTLEMENT_KINDS.filter(value=>!['ESTORNAR','SUBSTITUIR'].includes(value))).map(value=><option key={value} value={value}>{SETTLEMENT_LABELS[value]}</option>)}</select></HelpLabel>
        <HelpLabel help="Data civil em que o movimento financeiro ocorreu." className="grid gap-1">Data efetiva<input required type="date" name="effectiveOn" defaultValue={today} max={today} className="rounded border p-2"/></HelpLabel>
        <HelpLabel help="Identificação do documento da operadora que comprova o movimento." className="grid gap-1">Demonstrativo ou protocolo<input required name="reference" maxLength={120} className="rounded border p-2"/></HelpLabel>
        <HelpLabel help="Valor total do movimento em reais; deve corresponder às alocações informadas." className="grid gap-1">Valor total (R$)<input required name="amount" inputMode="decimal" value={amount} readOnly={kind==='ESTORNAR'} onChange={event=>setAmount(event.target.value)} placeholder="100,00" className="rounded border p-2"/></HelpLabel>
      </div>
      <HelpLabel help="Descreva a justificativa deste registro ou alteração para manter sua rastreabilidade." className="grid gap-1">Motivo do registro, revisão ou correção<textarea required name="reason" maxLength={300} className="rounded border p-2"/></HelpLabel>
      {kind==='AJUSTAR'&&<p>Valor positivo acrescenta faturado; negativo reduz. O ajuste não altera lote/XML nem cria recebimento. Reduções não podem consumir valores recebidos, em análise ou baixados.</p>}
      {kind==='ESTORNAR'?<p>Inverte somente as alocações válidas deste recebimento e restaura suas classificações originais. Preserva demonstrativo, autor e registros anteriores.</p>:<>
        <p>Alocação integral, sem crédito excedente. Use valores como 100,00, sem separador de milhar. Para receber glosa, selecione a origem em análise; baixa definitiva exige reabertura explícita.</p>
        <p className="text-sm">Sugestões de itens correspondem à página consultada. O identificador de outro item do mesmo contrato também pode ser informado, inclusive de outro lote.</p>
        <datalist id={prefix+'-items'}>{candidates.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</datalist>
        <datalist id={prefix+'-glosas'}>{glosas.map(glosa=><option key={glosa.id} value={glosa.id}>{glosa.label}</option>)}</datalist>
        {lines.map((line,index)=><fieldset key={line.key} className="grid gap-2 rounded border p-3 sm:grid-cols-2"><legend>Alocação {index+1}</legend>
          <HelpLabel help="Selecione o item faturado ao qual o valor será atribuído." className="grid gap-1">Item faturado<select value={candidates.some(item=>item.id===line.receivableId)?line.receivableId:line.receivableId?'other':''} onChange={event=>update(line.key,{receivableId:event.target.value==='other'?' ':event.target.value,glosaRootId:''})} required className="rounded border p-2"><option value="">Selecione</option>{candidates.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}<option value="other">Outro item do contrato: informar identificador</option></select></HelpLabel>
          {line.receivableId&&!candidates.some(item=>item.id===line.receivableId)&&<HelpLabel help="Identificador de outro item faturado que receberá parte do valor." className="grid gap-1">Identificador do outro item<input required list={prefix+'-items'} value={line.receivableId.trim()} onChange={event=>update(line.key,{receivableId:event.target.value||' ',glosaRootId:''})} className="rounded border p-2"/></HelpLabel>}
          <HelpLabel help="Parcela do movimento atribuída a este item, em reais." className="grid gap-1">Valor alocado (R$)<input required inputMode="decimal" value={line.amount} onChange={event=>update(line.key,{amount:event.target.value})} className="rounded border p-2"/></HelpLabel>
          {!['GLOSAR','AJUSTAR'].includes(kind)&&<><HelpLabel help="Identifica a origem que está sendo conciliada nesta alocação." className="grid gap-1">Origem da alocação<select value={glosas.some(glosa=>glosa.id===line.glosaRootId)?line.glosaRootId:line.glosaRootId?'other':''} required={['LIBERAR','DEFINIR','REABRIR'].includes(kind)} onChange={event=>update(line.key,{glosaRootId:event.target.value==='other'?' ':event.target.value})} className="rounded border p-2"><option value="">{['LIBERAR','DEFINIR','REABRIR'].includes(kind)?'Selecione a glosa original':'Saldo em aberto'}</option>{glosas.filter(glosa=>glosa.receivableId===line.receivableId).map(glosa=><option key={glosa.id} value={glosa.id}>{glosa.label}</option>)}<option value="other">Outra glosa: informar identificador</option></select></HelpLabel>{line.glosaRootId&&!glosas.some(glosa=>glosa.id===line.glosaRootId)&&<HelpLabel help="Vincula a revisão à glosa original para preservar seu histórico." className="grid gap-1">Identificador da glosa original<input required list={prefix+'-glosas'} value={line.glosaRootId.trim()} onChange={event=>update(line.key,{glosaRootId:event.target.value||' '})} className="rounded border p-2"/></HelpLabel>}</>}
          {kind==='GLOSAR'&&<HelpLabel help="Código ou justificativa de glosa conforme o demonstrativo recebido da operadora." className="grid gap-1">Código/motivo de glosa do demonstrativo<input required maxLength={40} value={line.code} onChange={event=>update(line.key,{code:event.target.value})} className="rounded border p-2"/></HelpLabel>}
          <NativeActionButton help="Retira esta alocação do formulário; nada é salvo até confirmar o movimento." type="button" onClick={()=>setLines(current=>current.filter(item=>item.key!==line.key))} className="w-fit underline">Remover alocação {index+1}</NativeActionButton>
        </fieldset>)}
        <p role="status">Soma das alocações: {formatBRL(total)} · diferença: {formatBRL((parseSettlementMoney(amount)??BigInt("0"))-total)}</p>
        <NativeActionButton help="Acrescenta uma linha para distribuir o valor do movimento entre itens faturados." type="button" disabled={lines.length>=1000} className="underline" onClick={()=>{setLines(current=>[...current,{key:nextKey,receivableId:'',glosaRootId:'',amount:'',code:''}]);setNextKey(value=>value+1);}}>Adicionar alocação</NativeActionButton>
      </>}
      {state?.error&&<p role="alert" className="text-destructive">{state.error}</p>}
      <NativeActionButton help="Valida e registra o movimento financeiro e suas alocações." type="submit" className="block rounded border px-4 py-2 font-medium">{pending?'Confirmando…':'Confirmar movimento'}</NativeActionButton>
    </fieldset>
  </form>;
}
