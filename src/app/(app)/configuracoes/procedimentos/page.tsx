import { NativeActionButton } from "@/components/informative-help";
import Link from "next/link";
import { getContractConfiguration } from "@/modules/administrativo/queries";
import { listProcedures } from "@/modules/administrativo/catalog-queries";
import { CatalogPagination } from "../catalog-ui";
export default async function ProceduresPage({ searchParams }: { searchParams: Promise<{ contrato?: string; q?: string; page?: string }> }) {
  const search = await searchParams;
  // Sem contrato selecionado, a entrada passa pelo catálogo autorizado de operadoras.
  if (!search.contrato) {
    await listProcedures("", {});
    return <div><h1 className="text-2xl font-semibold">Procedimentos</h1><Link className="underline" href="/configuracoes/operadoras">Selecione uma operadora e um contrato para abrir o catálogo.</Link></div>;
  }
  const contract = await getContractConfiguration(search.contrato);
  if (!contract) return <p>Contrato não encontrado.</p>;
  const result = await listProcedures(contract.id, { q: search.q, page: search.page });
  const href = `/configuracoes/procedimentos?contrato=${contract.id}`;
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-5"><h1 className="text-2xl font-semibold">Procedimentos — {contract.name}</h1>
    <p className="text-sm">{contract.operator.name}. Inclui cadastros inativos para consulta.</p>
    <Link className="underline" href={`/configuracoes/operadoras/${contract.operatorId}/contratos/${contract.id}`}>Voltar ao contrato</Link>
    <Link className="underline" href={`/configuracoes/procedimentos/novo?contrato=${contract.id}`}>Novo procedimento</Link>
    <form className="flex gap-2"><input type="hidden" name="contrato" value={contract.id} />
      <input className="min-w-0 flex-1 rounded border p-2" name="q" aria-label="Buscar por nome ou código" defaultValue={search.q} maxLength={120} /><NativeActionButton help="Atualiza a consulta usando os filtros informados, sem alterar os registros." type="submit" className="underline">Buscar</NativeActionButton></form>
    {!result ? <p role="alert">Filtros inválidos.</p> : <><p>{result.total} procedimento(s)</p>
      {result.items.map((item) => <Link className="rounded border p-3" key={item.id} href={`/configuracoes/procedimentos/${item.id}`}>
        <span className="break-words font-medium">{item.name}</span><span className="block text-sm">Tabela {item.tableCode} · Código {item.code} · {item.active ? "Ativo" : "Inativo"}</span></Link>)}
      <CatalogPagination page={result.page} pages={result.pages} href={`${href}&q=${encodeURIComponent(search.q ?? "")}`} /></>}
  </div>;
}
