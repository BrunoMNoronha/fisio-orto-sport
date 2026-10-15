import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCoverage } from "@/modules/administrativo/beneficiary-queries";
import { BeneficiaryForm } from "../../beneficiary-form";
import { ConfigHistory } from "../../../configuracoes/operadoras/history";
import { Pagination, dateValue, dateLabel, Validity, Notice } from "../../ui";
export default async function CoveragePage({params,searchParams}: {params:Promise<{id:string}>;searchParams:Promise<{page?:string}>}) {
  const {id}=await params, item=await getCoverage(id,(await searchParams).page); if(!item) notFound();
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5"><h1 className="text-2xl font-semibold">Cobertura — {item.patient.fullName}</h1>
    <p>{item.contract.operator.name} · {item.contract.name}</p><Notice /><Validity active={item.active} startsOn={item.startsOn} endsOn={item.endsOn} />
    <p className="text-sm">Para trocar de contrato ou paciente, crie outra cobertura. Alterações ficam no histórico; consumo vigente impede correção ou inativação.</p>
    <BeneficiaryForm key={item.version} kind="coverage" id={id} requestId={randomUUID()} version={item.version} hidden={{patientId:item.patientId,contractId:item.contractId}}
      initial={{beneficiaryName:item.beneficiaryName,cardNumber:item.cardNumber,planName:item.planName??"",startsOn:dateValue(item.startsOn),endsOn:dateValue(item.endsOn),active:String(item.active)}}
      cancelHref={`/administrativo/beneficiarios/${item.patientId}`} />
    <Link className="underline" href={`/administrativo/coberturas/${id}/elegibilidade`}>Consultar exigência ou dispensa por procedimento</Link>
    <h2 className="text-lg font-semibold">Autorizações recebidas</h2><Link className="underline" href={`/administrativo/autorizacoes/nova?cobertura=${id}`}>Nova autorização</Link>
    {!item.authorizations.length && <p role="status">Sem autorização recebida. Exigência ou dispensa depende da regra configurada por procedimento.</p>}
    {item.authorizations.map((a)=><Link key={a.id} className="rounded border p-3" href={`/administrativo/autorizacoes/${a.id}`}>{a.number} · {dateLabel(a.startsOn)} a {dateLabel(a.endsOn)} · {a.active?"Recebida":"Cancelada"}</Link>)}
    <Pagination page={item.page} pages={item.pages} href={`/administrativo/coberturas/${id}`} /><ConfigHistory changes={item.changes} /></div>;
}
