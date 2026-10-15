import Link from "next/link";
import { notFound } from "next/navigation";
import { getCoverage,getAuthorizationProcedure,listAuthorizationProcedures,checkEligibility } from "@/modules/administrativo/beneficiary-queries";
import { Search,Pagination,eligibilityLabels } from "../../../ui";
export default async function CoverageEligibility({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{procedimento?:string;q?:string;page?:string;data?:string;quantidade?:string}>}) {
  const {id}=await params,search=await searchParams,coverage=await getCoverage(id);if(!coverage)notFound();
  const procedure=search.procedimento?await getAuthorizationProcedure(search.procedimento):null;
  if(procedure&&procedure.contractId!==coverage.contractId)notFound();
  const options=!procedure?await listAuthorizationProcedures(coverage.contractId,{q:search.q,page:search.page}):null;
  const result=procedure&&search.data!==undefined?await checkEligibility({patientId:coverage.patientId,coverageId:id,procedureId:procedure.id,executionOn:search.data,quantity:Number(search.quantidade??1)}):null;
  const base=`/administrativo/coberturas/${id}/elegibilidade`;
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5"><h1 className="text-2xl font-semibold">Elegibilidade da cobertura</h1>
    <p>{coverage.patient.fullName} · Carteirinha {coverage.cardNumber}</p><Link className="underline" href={`/administrativo/coberturas/${id}`}>Voltar à cobertura</Link>
    {!procedure?<><Search label="Buscar procedimento" q={search.q}/>{!options?<p role="alert">Filtros inválidos.</p>:<>
      {!options.items.length&&<p>Nenhum procedimento ativo encontrado.</p>}
      {options.items.map(p=><Link key={p.id} className="rounded border p-3" href={`${base}?procedimento=${p.id}`}>{p.code} · {p.name}</Link>)}
      <Pagination page={options.page} pages={options.pages} href={`${base}?q=${encodeURIComponent(search.q??"")}`}/></>}</>:<>
      <p>{procedure.code} · {procedure.name}</p>
      <form className="flex flex-wrap gap-3"><input type="hidden" name="procedimento" value={procedure.id}/>
        <label htmlFor="data">Data de execução</label><input id="data" name="data" type="date" required defaultValue={search.data} className="rounded border p-2"/>
        <label htmlFor="quantidade">Quantidade</label><input id="quantidade" name="quantidade" type="number" required min={1} max={2147483647} step={1} defaultValue={search.quantidade??"1"} className="w-24 rounded border p-2"/>
        <button type="submit" className="underline">Consultar</button></form>
      {result&&<p role="status" className="rounded border p-3 text-sm">{eligibilityLabels[result.status]} Nenhum saldo foi consumido.</p>}
      <p className="text-sm">Se a autorização for exigida, abra o item da autorização recebida para consultar seu saldo e vigência.</p></>}
  </div>;
}
