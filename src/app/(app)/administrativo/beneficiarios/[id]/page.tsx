import Link from "next/link";
import { notFound } from "next/navigation";
import { getBeneficiary } from "@/modules/administrativo/beneficiary-queries";
import { Pagination, Notice, dateLabel, AdminBack } from "../../ui";
export default async function BeneficiaryPage({ params,searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{page?:string}> }) {
  const {id} = await params, item = await getBeneficiary(id,(await searchParams).page); if (!item) notFound();
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-5"><h1 className="break-words text-2xl font-semibold">{item.fullName}</h1><Notice />
    <AdminBack /><Link className="underline" href={`/administrativo/coberturas/nova?paciente=${id}`}>Nova cobertura</Link>
    {!item.coverages.length && <p role="status">Sem cobertura estruturada. Dados de convênio do cadastro antigo não são convertidos automaticamente.</p>}
    {item.coverages.map((c) => <Link key={c.id} className="rounded border p-3" href={`/administrativo/coberturas/${c.id}`}>{c.contract.operator.name} · {c.contract.name}
      <span className="block text-sm">Carteirinha {c.cardNumber} · {dateLabel(c.startsOn)} a {c.endsOn ? dateLabel(c.endsOn) : "sem data final"} · {c.active ? "Ativa" : "Inativa"}</span></Link>)}
    <Pagination page={item.page} pages={item.pages} href={`/administrativo/beneficiarios/${id}`} /></div>;
}
