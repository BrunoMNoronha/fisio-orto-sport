import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductionSession } from "@/modules/administrativo/production-queries";
import { PRODUCTION_LABELS } from "@/modules/administrativo/production-validation";
import { ProductionForm } from "../production-form";
export default async function SessionProductionPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,result=await getProductionSession(id);if(!result)notFound();
 const {session,items,coverages,procedures,authorizationItems}=result;
 return <div className="mx-auto flex max-w-3xl flex-col gap-5"><h1 className="text-2xl font-semibold">Conferência de produção</h1><p>{session.patient.fullName} — {session.occurredAt.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} — {session.professionalNameSnapshot}</p>
 <Link href={`/administrativo/beneficiarios/${session.patientId}`}>Revisar coberturas e autorizações</Link>
 {result.limited&&<p role="status">Exibindo os primeiros 100 registros por seleção. Revise o catálogo/coberturas se o registro desejado não aparecer.</p>}
 {items.map(item=><section key={`${item.id}-${item.version}`} className="flex flex-col gap-3"><h2>{item.procedure.code} — {PRODUCTION_LABELS[item.state]}</h2><p>{item.pendingReason}{item.adjustmentPending?' Ajuste pendente após alteração clínica. Snapshot fechado preservado.':''}</p>
 {item.amountCents!==null&&<p>Total conferido: R$ {(item.amountCents/BigInt(100)).toString()},{(item.amountCents%BigInt(100)).toString().padStart(2,'0')}</p>}
 {!['INVALIDADO','FECHADO','ENVIADO'].includes(item.state)&&<ProductionForm id={item.id} sessionId={id} requestId={randomUUID()} version={item.version} state={item.state} coverageId={item.coverageId} procedureId={item.procedureId} quantity={item.quantity} endTime={item.endTime} coverages={coverages} procedures={procedures} authorizationItems={authorizationItems}/>}
 <details><summary>Histórico administrativo</summary>{item.changes.map(c=><p key={c.version}>Versão {c.version} — {c.actor.name}: {c.reason}</p>)}</details></section>)}
 {session.status==='VALIDO'&&session.patient.status==='ATIVO'&&<><h2 className="text-lg font-semibold">Novo procedimento executado</h2><ProductionForm id={randomUUID()} sessionId={id} requestId={randomUUID()} version={0} coverages={coverages} procedures={procedures} authorizationItems={authorizationItems}/></>}
 <Link href="/administrativo/producao">Voltar à produção</Link></div>;
}
