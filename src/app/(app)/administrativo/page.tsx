import Link from "next/link";
import { listBeneficiaryPatients } from "@/modules/administrativo/beneficiary-queries";
import { Search, Pagination, Notice } from "./ui";
export default async function AdministrativePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const search = await searchParams, result = await listBeneficiaryPatients({q:search.q,page:search.page});
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-5"><h1 className="text-2xl font-semibold">Administrativo</h1><Notice />
    <Link className="rounded border p-3" href="/administrativo/producao">Produção e fila de pendências</Link><Link className="rounded border p-3" href="/administrativo/relatorios">Relatórios, CSV e impressão</Link><h2 className="text-lg font-semibold">Coberturas e autorizações por paciente</h2><Search label="Buscar paciente pelo nome" q={search.q} />
    {!result ? <p role="alert">Filtros inválidos.</p> : <><p>{result.total} paciente(s)</p>
      {result.items.map((p) => <Link className="rounded border p-3" key={p.id} href={`/administrativo/beneficiarios/${p.id}`}>{p.fullName}<span className="block text-sm">{p.status === "ATIVO" ? "Ativo" : "Inativo"}</span></Link>)}
      <Pagination page={result.page} pages={result.pages} href={`/administrativo?q=${encodeURIComponent(search.q ?? "")}`} /></>}
  </div>;
}
