import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {getSettlementRecord} from '@/modules/administrativo/settlement-queries';
import {formatBRL,formatCivilDate} from '@/modules/financeiro/validation';
import {SETTLEMENT_LABELS,type SETTLEMENT_KINDS} from '@/modules/administrativo/settlement-validation';
import {SettlementForm} from '../../settlement-form';
const decimal=(cents:bigint)=>String(cents/BigInt("100"))+','+String(cents%BigInt("100")).padStart(2,'0');
export default async function Page({params}:{params:Promise<{id:string}>}){
  const data=await getSettlementRecord((await params).id);
  if(!data)return <p role="alert">Movimento não encontrado.</p>;
  const {record:r,canManage}=data,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  return <div className="mx-auto max-w-6xl space-y-4"><h1 className="text-2xl font-semibold">{SETTLEMENT_LABELS[r.kind as typeof SETTLEMENT_KINDS[number]]}</h1><p>{r.contract.operator.name} · {r.contract.name} · {formatBRL(r.amountCents)}</p><p>Data efetiva {formatCivilDate(r.effectiveOn)} · registrado {r.createdAt.toISOString()} · autor {r.actor.name}</p><p>Demonstrativo/protocolo: {r.reference}</p><p>Motivo: {r.reason}</p>
    {r.reversesId&&<p>Estorna/substitui <Link className="underline" href={'/administrativo/conciliacao/registros/'+r.reversesId}>{r.reversesId}</Link></p>}{r.reversedBy&&<p>Estornado/substituído por <Link className="underline" href={'/administrativo/conciliacao/registros/'+r.reversedBy.id}>{r.reversedBy.id}</Link></p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption>Alocações e ajustes preservados em centavos exatos; valores negativos recompõem a classificação correspondente.</caption><thead><tr>{['Item','Origem de glosa','Parte','Recebido Δ','Análise Δ','Baixa Δ','Faturado Δ'].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{r.lines.map(line=><tr key={line.id} className="border-t"><td className="break-all p-2">{line.receivableId}</td><td className="break-all p-2">{line.glosaRootId??(r.kind==='GLOSAR'?line.id:'—')}{line.code&&' · '+line.code}</td><td className="p-2">{line.reversalPart?'Inversão do original':'Nova alocação'}</td>{(['receivedDelta','analysisDelta','writtenOffDelta','billedDelta'] as const).map(key=><td key={key} className="whitespace-nowrap p-2">{formatBRL(line[key])}</td>)}</tr>)}</tbody></table></div>
    {canManage&&['RECEBER','SUBSTITUIR'].includes(r.kind)&&!r.reversedBy&&<SettlementForm key={r.id} id={randomUUID()} requestId={randomUUID()} contractId={r.contractId} today={today} source={{id:r.id,amount:decimal(r.amountCents),lines:r.lines.filter(line=>!line.reversalPart).map(line=>({receivableId:line.receivableId,glosaRootId:line.glosaRootId??'',amount:decimal(line.receivedDelta)}))}}/>}
    <Link className="underline" href={'/administrativo/conciliacao?contractId='+r.contractId}>Voltar à conciliação do contrato</Link>
  </div>;
}
