import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBeneficiary, getBeneficiaryContract, listBeneficiaryContracts } from "@/modules/administrativo/beneficiary-queries";
import { BeneficiaryForm } from "../../beneficiary-form";
import { Search, Pagination, Notice } from "../../ui";
export default async function NewCoverage({ searchParams }: { searchParams: Promise<{ paciente?:string; contrato?:string; q?:string; page?:string }> }) {
  const search = await searchParams, patient = await getBeneficiary(search.paciente ?? ""); if (!patient) notFound();
  const parent = search.contrato ? await getBeneficiaryContract(search.contrato) : null;
  const choices = !parent ? await listBeneficiaryContracts({q:search.q,page:search.page}) : null;
  const base = `/administrativo/coberturas/nova?paciente=${patient.id}`;
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5"><h1 className="text-2xl font-semibold">Nova cobertura — {patient.fullName}</h1><Notice />
    {!parent ? <><h2>Selecione o contrato</h2><Search q={search.q} label="Buscar operadora ou contrato" hidden={{paciente:patient.id}} />
      {!choices ? <p role="alert">Filtros inválidos.</p> : <>{choices.items.length===0 && <p>Nenhum contrato ativo encontrado.</p>}
        {choices.items.map((c) => <Link className="rounded border p-3" key={c.id} href={`${base}&contrato=${c.id}`}>{c.operator.name} · {c.name}</Link>)}
        <Pagination page={choices.page} pages={choices.pages} href={`${base}&q=${encodeURIComponent(search.q ?? "")}`} /></>}</>
      : <><p>{parent.operator.name} · {parent.name}</p><BeneficiaryForm kind="coverage" id={randomUUID()} requestId={randomUUID()} version={0}
        hidden={{patientId:patient.id,contractId:parent.id}} initial={{active:"true"}} cancelHref={`/administrativo/beneficiarios/${patient.id}`} /></>}
  </div>;
}
