import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getAuthorizationItem,checkEligibility } from "@/modules/administrativo/beneficiary-queries";
import { BeneficiaryForm } from "../../beneficiary-form";
import { ConfigHistory } from "../../../configuracoes/operadoras/history";
import { Notice,eligibilityLabels,dateLabel } from "../../ui";
export default async function ItemPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{data?:string;quantidade?:string}>}) {
  const {id}=await params,search=await searchParams,item=await getAuthorizationItem(id); if(!item) notFound();
  const result=search.data!==undefined?await checkEligibility({patientId:item.authorization.coverage.patientId,coverageId:item.authorization.coverageId,
    procedureId:item.procedureId,itemId:id,executionOn:search.data,quantity:Number(search.quantidade??1)}):null;
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5"><h1 className="break-words text-2xl font-semibold">{item.procedure.code} · {item.procedure.name}</h1>
    <p>{item.authorization.coverage.patient.fullName} · Autorização {item.authorization.number}</p><Notice />
    <p className="rounded border p-3">Autorizado: {item.authorizedQuantity} · Consumido: {item.consumed} · Disponível: {item.available}</p>
    <p className="text-sm">O saldo é aritmético. Sua utilização também depende da vigência e da situação dos cadastros.</p>
    <BeneficiaryForm key={item.version} kind="item" id={id} version={item.version} requestId={randomUUID()} hidden={{authorizationId:item.authorizationId,contractId:item.contractId,procedureId:item.procedureId}}
      initial={{authorizedQuantity:String(item.authorizedQuantity),active:String(item.active)}} cancelHref={`/administrativo/autorizacoes/${item.authorizationId}`} />
    <section className="flex flex-col gap-3"><h2 className="text-lg font-semibold">Consultar elegibilidade na execução</h2>
      <form className="flex flex-wrap gap-3"><label htmlFor="data">Data de execução</label><input id="data" name="data" type="date" required defaultValue={search.data} className="rounded border p-2" />
        <label htmlFor="quantidade">Quantidade</label><input id="quantidade" name="quantidade" type="number" min={1} max={2147483647} step={1} required defaultValue={search.quantidade??"1"} className="w-24 rounded border p-2" />
        <button type="submit" className="underline">Consultar</button></form>
      {result&&<p role="status" className="rounded border p-3 text-sm">{eligibilityLabels[result.status]} Consulta sem reservar ou consumir saldo.</p>}
    </section>
    <section><h2 className="text-lg font-semibold">Últimos movimentos de saldo</h2><p className="text-sm">Unidades consumidas e devolvidas pela conferência de produção.</p>
      {!item.uses.length && <p className="text-sm">Sem movimentos de saldo.</p>}
      {item.uses.map((u)=><p key={u.id} className="border-b py-2 text-sm">{u.reversesId?"Devolução":"Consumo"}: {Math.abs(u.quantity)} · Execução {dateLabel(u.executionOn)} · {u.reason}</p>)}</section>
    <ConfigHistory changes={item.changes} /></div>;
}
