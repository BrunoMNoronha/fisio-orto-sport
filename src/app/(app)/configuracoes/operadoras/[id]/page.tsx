import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { buttonVariants } from "@/components/ui/button";
import { getOperatorConfiguration } from "@/modules/administrativo/queries";
import { ConfigForm } from "../config-form";
import { ConfigHistory } from "../history";

export default async function OperadoraPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const operator = await getOperatorConfiguration(id, (await searchParams).page);
  if (!operator) notFound();
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
    <h1 className="break-words text-2xl font-semibold">{operator.name}</h1>
    <p className="text-sm text-muted-foreground">Inativar a operadora preserva os contratos e o histórico. Contratos de operadora inativa não ficam disponíveis para novos vínculos.</p>
    <ConfigForm key={operator.version} kind="operator" id={id} requestId={randomUUID()} expectedVersion={operator.version}
      initial={{ name: operator.name, registrationAns: operator.registrationAns ?? "", active: String(operator.active), reason: "" }} cancelHref="/configuracoes/operadoras" />
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Contratos</h2>
      <div><Link href={`/configuracoes/operadoras/${id}/contratos/novo`} className={buttonVariants({ variant: "outline" })}>Novo contrato</Link></div>
      {operator.contracts.length === 0 && <p className="text-sm">Nenhum contrato cadastrado.</p>}
      <ul className="flex flex-col gap-2">{operator.contracts.map((contract) => <li key={contract.id} className="rounded-lg border p-3">
        <Link href={`/configuracoes/operadoras/${id}/contratos/${contract.id}`} className="break-words underline">{contract.name}</Link>
        <p className="text-sm text-muted-foreground">{contract.active && operator.active ? "Ativo" : "Indisponível para novos vínculos"} · TISS: {contract.tissVersion ?? "Pendente"} · Homologação pendente</p>
      </li>)}</ul>
      <nav aria-label="Páginas de contratos" className="flex flex-wrap gap-3 text-sm">
        {operator.contractPage > 1 && <Link className="underline" href={`?page=${operator.contractPage - 1}`}>Anterior</Link>}
        <span>Página {operator.contractPage} de {operator.contractPages} · {operator._count.contracts} contrato(s)</span>
        {operator.contractPage < operator.contractPages && <Link className="underline" href={`?page=${operator.contractPage + 1}`}>Próxima</Link>}
      </nav>
    </section>
    <ConfigHistory changes={operator.changes} />
  </div>;
}
