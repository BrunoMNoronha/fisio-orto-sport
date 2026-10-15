import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthorization, getAuthorizationProcedure, listAuthorizationProcedures } from "@/modules/administrativo/beneficiary-queries";
import { BeneficiaryForm } from "../../../../beneficiary-form";
import { Search,Pagination } from "../../../../ui";
export default async function NewItem({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{procedimento?:string;q?:string;page?:string}>}) {
  const {id}=await params,search=await searchParams,item=await getAuthorization(id); if(!item) notFound();
  const procedure=search.procedimento?await getAuthorizationProcedure(search.procedimento):null;
  if(procedure&&procedure.contractId!==item.contractId) notFound();
  const options=!procedure?await listAuthorizationProcedures(item.contractId,{q:search.q,page:search.page}):null;
  const base=`/administrativo/autorizacoes/${id}/itens/novo`;
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5"><h1 className="text-2xl font-semibold">Adicionar procedimento autorizado</h1><p>Autorização {item.number} · {item.coverage.patient.fullName}</p>
    {!procedure?<><Search label="Buscar procedimento por nome ou código" q={search.q} />
      {!options?<p role="alert">Filtros inválidos.</p>:<>{!options.items.length&&<p>Nenhum procedimento ativo encontrado.</p>}
        {options.items.map((p)=><Link key={p.id} className="rounded border p-3" href={`${base}?procedimento=${p.id}`}>{p.code} · {p.name}</Link>)}
        <Pagination page={options.page} pages={options.pages} href={`${base}?q=${encodeURIComponent(search.q??"")}`} /></>}</>
      :<><p>{procedure.code} · {procedure.name}</p><p className="text-sm">Quantidade inteira na unidade contratada do procedimento. Sessão ou quantidade prevista no plano terapêutico não representa saldo autorizado.</p>
        <BeneficiaryForm kind="item" id={randomUUID()} requestId={randomUUID()} version={0} hidden={{authorizationId:id,contractId:item.contractId,procedureId:procedure.id}}
          initial={{active:"true"}} cancelHref={`/administrativo/autorizacoes/${id}`} /></>}
  </div>;
}
