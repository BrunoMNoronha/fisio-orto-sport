import { NativeActionButton } from "@/components/informative-help";
import Link from "next/link";
import { listProfessionals } from "@/modules/administrativo/catalog-queries";
import { PROFESSIONAL_PURPOSES } from "@/modules/administrativo/catalog-validation";
import { CatalogPagination } from "../catalog-ui";
export default async function Professionals({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const search = await searchParams;
  const result = await listProfessionals({ q: search.q, page: search.page });
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-5"><h1 className="text-2xl font-semibold">Identificação profissional</h1>
    <p className="text-sm">Solicitantes e executantes para o faturamento. Dados incompletos permanecem pendentes.</p>
    <Link className="underline" href="/configuracoes/profissionais/novo">Novo profissional</Link>
    <form className="flex gap-2"><input className="min-w-0 flex-1 rounded border p-2" name="q" aria-label="Buscar profissional" defaultValue={search.q} maxLength={120} />
      <NativeActionButton help="Atualiza a consulta usando os filtros informados, sem alterar os registros." className="underline" type="submit">Buscar</NativeActionButton></form>
    {!result ? <p role="alert">Filtros inválidos.</p> : <><p>{result.total} profissional(is)</p>
      {result.items.map((item) => <Link key={item.id} href={`/configuracoes/profissionais/${item.id}`} className="rounded border p-3">
        <span className="break-words font-medium">{item.name}</span><span className="block text-sm">{PROFESSIONAL_PURPOSES[item.purpose as keyof typeof PROFESSIONAL_PURPOSES]} · {item.active ? "Ativo" : "Inativo"}</span>
        {(!item.councilCode || !item.councilNumber || !item.councilState || !item.occupationCode) && <span className="block text-sm">Identificação pendente</span>}</Link>)}
      <CatalogPagination page={result.page} pages={result.pages} href={`/configuracoes/profissionais?q=${encodeURIComponent(search.q ?? "")}`} /></>}
  </div>;
}
