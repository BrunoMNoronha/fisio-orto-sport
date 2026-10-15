import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getCoverage } from "@/modules/administrativo/beneficiary-queries";
import { BeneficiaryForm } from "../../beneficiary-form";
import { Notice } from "../../ui";
export default async function NewAuthorization({searchParams}:{searchParams:Promise<{cobertura?:string}>}) {
  const item=await getCoverage((await searchParams).cobertura??""); if(!item) notFound();
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5"><h1 className="text-2xl font-semibold">Nova autorização recebida</h1>
    <p>{item.patient.fullName} · Carteirinha {item.cardNumber}</p><Notice /><p className="text-sm">Registre o documento recebido. Número e senha de autorização são distintos da numeração futura da guia. A validade deve estar dentro da cobertura.</p>
    <BeneficiaryForm kind="authorization" id={randomUUID()} requestId={randomUUID()} version={0} hidden={{coverageId:item.id,contractId:item.contractId}}
      initial={{active:"true"}} cancelHref={`/administrativo/coberturas/${item.id}`} /></div>;
}
