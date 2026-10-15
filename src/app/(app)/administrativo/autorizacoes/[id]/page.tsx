import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthorization } from "@/modules/administrativo/beneficiary-queries";
import { BeneficiaryForm } from "../../beneficiary-form";
import { ConfigHistory } from "../../../configuracoes/operadoras/history";
import { Pagination, dateValue, Validity, Notice } from "../../ui";
export default async function AuthorizationPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{page?:string}>}) {
  const {id}=await params,item=await getAuthorization(id,(await searchParams).page); if(!item) notFound();
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5"><h1 className="text-2xl font-semibold">Autorização {item.number}</h1>
    <p>{item.coverage.patient.fullName} · Carteirinha {item.coverage.cardNumber}</p><Notice /><Validity active={item.active} startsOn={item.startsOn} endsOn={item.endsOn} />
    <p className="text-sm">Consumo vigente impede corrigir ou cancelar esta autorização. Ajuste a produção antes, com devolução explícita quando permitida.</p>
    <BeneficiaryForm key={item.version} kind="authorization" id={id} requestId={randomUUID()} version={item.version} hidden={{coverageId:item.coverageId,contractId:item.contractId}}
      initial={{number:item.number,accessCode:item.accessCode??"",issuedOn:dateValue(item.issuedOn),startsOn:dateValue(item.startsOn),endsOn:dateValue(item.endsOn),active:String(item.active)}}
      cancelHref={`/administrativo/coberturas/${item.coverageId}`} />
    <h2 className="text-lg font-semibold">Itens e saldos por procedimento</h2><Link className="underline" href={`/administrativo/autorizacoes/${id}/itens/novo`}>Adicionar procedimento autorizado</Link>
    {!item.items.length&&<p role="status">Sem itens autorizados. Não há saldo disponível para consumo.</p>}
    {item.items.map((i)=><Link key={i.id} href={`/administrativo/itens/${i.id}`} className="rounded border p-3">{i.procedure.code} · {i.procedure.name}
      <span className="block text-sm">Autorizado: {i.authorizedQuantity} · Consumido: {i.consumed} · Disponível: {i.available} · {i.active?"Ativo":"Inativo"}</span></Link>)}
    <Pagination page={item.page} pages={item.pages} href={`/administrativo/autorizacoes/${id}`} /><ConfigHistory changes={item.changes} /></div>;
}
