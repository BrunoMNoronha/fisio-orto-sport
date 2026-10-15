import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProcedure, resolveTariff } from "@/modules/administrativo/catalog-queries";
import { CatalogForm } from "../../catalog-form";
import { CatalogPagination, dateLabel, money } from "../../catalog-ui";
import { ConfigHistory } from "../../operadoras/history";
import { getProcedureRules } from "@/modules/administrativo/beneficiary-queries";
import { BeneficiaryForm } from "../../../administrativo/beneficiary-form";
const statuses = { DATA_INVALIDA: "Informe uma data válida.", PROCEDIMENTO_NAO_ENCONTRADO: "Procedimento não encontrado.",
  INATIVO: "Operadora, contrato ou procedimento inativo.", SEM_TARIFA: "Nenhuma tarifa ativa nessa data.", TARIFA_AMBIGUA: "Há tarifas conflitantes. Revise a configuração." };
export default async function Procedure({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; data?: string }>;
}) {
  const { id } = await params, search = await searchParams;
  const item = await getProcedure(id, search.page);
  if (!item) notFound();
  const rules = await getProcedureRules(id), rule = rules[0];
  const result = search.data !== undefined ? await resolveTariff(item.contractId, id, search.data) : null;
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-6"><h1 className="break-words text-2xl font-semibold">{item.name}</h1>
    <p className="text-sm">{item.contract.operator.name} · {item.contract.name}</p>
    {(!item.contract.active || !item.contract.operator.active) && <p role="status">Operadora ou contrato inativo. Novos vínculos e ativação estão bloqueados.</p>}
    <CatalogForm key={item.version} kind="procedure" id={id} requestId={randomUUID()} version={item.version} parentId={item.contractId}
      initial={{ name: item.name, code: item.code, tableCode: item.tableCode, active: String(item.active) }}
      cancelHref={`/configuracoes/procedimentos?contrato=${item.contractId}`} />
    <section className="flex flex-col gap-3"><h2 className="text-lg font-semibold">Tarifas por vigência</h2>
      <Link className="underline" href={`/configuracoes/tarifas/novo?procedimento=${id}`}>Nova tarifa</Link>
      {!item.tariffs.length && <p className="text-sm">Nenhuma tarifa cadastrada.</p>}
      {item.tariffs.map((t) => <Link key={t.id} href={`/configuracoes/tarifas/${t.id}`} className="rounded border p-3 text-sm">
        {money(t.amountCents)} · {dateLabel(t.startsOn)} a {t.endsOn ? dateLabel(t.endsOn) : "sem data final"} · {t.active ? "Ativa" : "Inativa"}</Link>)}
      <CatalogPagination page={item.page} pages={item.pages} href={`/configuracoes/procedimentos/${id}`} />
    </section>
    <section className="flex flex-col gap-3"><h2 className="text-lg font-semibold">Consultar valor na data de execução</h2>
      <form className="flex flex-wrap gap-3"><label htmlFor="data">Data de execução</label><input id="data" name="data" type="date" required defaultValue={search.data}
        min="2000-01-01" max="2100-12-31" className="rounded border p-2" /><button className="underline" type="submit">Consultar</button></form>
      {result && <p role="status" className="rounded border p-3 text-sm">{result.status === "OK"
        ? `${money(result.snapshot.amountCents)} · Tarifa versão ${result.snapshot.tariffVersion}. Consulta sem geração de cobrança.` : statuses[result.status]}</p>}
    </section>
    <section className="flex flex-col gap-3"><h2 className="text-lg font-semibold">Regra de autorização</h2>
      <p className="text-sm">Confirme a regra no contrato/manual. Sem confirmação, o faturamento fica pendente; o atendimento clínico continua disponível.</p>
      <BeneficiaryForm key={rule?.version ?? 0} kind="rule" id={randomUUID()} requestId={randomUUID()} version={rule?.version ?? 0}
        hidden={{procedureId:id}} initial={{mode:rule?.mode ?? "PENDENTE",reference:rule?.reference ?? ""}} cancelHref={`/configuracoes/procedimentos?contrato=${item.contractId}`} />
      {rules.map((r)=><details key={r.id} className="rounded border p-3 text-sm"><summary>Versão {r.version} · {r.mode} · {r.actor.name}</summary><p>{r.reference}</p><p>{r.reason}</p></details>)}
    </section><ConfigHistory changes={item.changes} /></div>;
}
