import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listOperatorConfigurations } from "@/modules/administrativo/queries";

export default async function OperadorasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const result = await listOperatorConfigurations(raw);
  const q = typeof raw.q === "string" ? raw.q : "";
  const href = (page: number) => `/configuracoes/operadoras?${new URLSearchParams({ q, page: String(page) })}`;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Operadoras e contratos</h1>
      <p className="text-sm text-muted-foreground">Cadastre os dados contratuais conforme forem confirmados. A operadora piloto e o volume de faturamento permanecem pendentes; salvar uma versão TISS não comprova homologação.</p>
      <div><Link href="/configuracoes/operadoras/nova" className={buttonVariants()}>Nova operadora</Link></div>
      <form className="flex gap-2" method="get">
        <label htmlFor="q" className="sr-only">Buscar operadora pelo nome</label>
        <Input id="q" name="q" defaultValue={q} maxLength={120} placeholder="Buscar pelo nome" />
        <Button variant="outline">Buscar</Button>
      </form>
      {result.error && <p role="alert" className="text-destructive">{result.error}</p>}
      {!result.error && result.items.length === 0 && <p>Nenhuma operadora encontrada.</p>}
      <ul className="flex flex-col gap-3">
        {result.items.map((operator) => <li key={operator.id} className="rounded-lg border p-4">
          <Link href={`/configuracoes/operadoras/${operator.id}`} className="break-words font-medium underline underline-offset-4">{operator.name}</Link>
          <p className="mt-1 text-sm text-muted-foreground">{operator.active ? "Ativa" : "Inativa"} · ANS: {operator.registrationAns ?? "Pendente"} · {operator._count.contracts} contrato(s)</p>
        </li>)}
      </ul>
      {!result.error && <nav aria-label="Páginas de operadoras" className="flex flex-wrap items-center gap-3 text-sm">
        {result.page > 1 && <Link href={href(result.page - 1)} className="underline">Anterior</Link>}
        <span>Página {result.page} de {result.pages} · {result.total} operadora(s)</span>
        {result.page < result.pages && <Link href={href(result.page + 1)} className="underline">Próxima</Link>}
      </nav>}
      <Link href="/configuracoes" className="text-sm underline">Voltar às configurações</Link>
    </div>
  );
}
