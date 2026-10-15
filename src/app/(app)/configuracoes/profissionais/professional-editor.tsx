import { randomUUID } from "node:crypto";
import { listLinkableUsers } from "@/modules/administrativo/catalog-queries";
import { CatalogForm } from "../catalog-form";
import { ConfigHistory } from "../operadoras/history";
import type { getProfessional } from "@/modules/administrativo/catalog-queries";
type Profile = NonNullable<Awaited<ReturnType<typeof getProfessional>>>;
export async function ProfessionalEditor({ item, q }: { item?: Profile; q?: string }) {
  const matches = await listLinkableUsers(q ?? "");
  const users = matches.slice(0,20);
  if (item?.user && !users.some((u) => u.id === item.userId)) users.unshift({ id: item.user.id, name: `${item.user.name}${!item.user.active || item.user.role !== "FISIOTERAPEUTA" ? " (vínculo anterior indisponível para novas seleções)" : ""}` });
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5"><h1 className="text-2xl font-semibold">{item ? "Editar profissional" : "Novo profissional"}</h1>
    <details className="rounded border p-3"><summary className="cursor-pointer text-sm">Localizar usuário para vínculo opcional</summary>
      <p className="my-2 text-sm">Busque antes de preencher o cadastro. A busca recarrega esta página.</p>
      <form className="flex flex-wrap gap-2"><input className="min-w-0 rounded border p-2" name="q" aria-label="Nome do usuário fisioterapeuta" defaultValue={q} maxLength={100} required />
        <button type="submit" className="underline">Localizar</button></form></details>
    {q && <p role="status" className="text-sm">{matches.length ? `${Math.min(matches.length,20)} usuário(s) disponível(is) no campo de vínculo.` : "Nenhum fisioterapeuta ativo encontrado."}
      {matches.length > 20 && " Refine o nome para localizar outros resultados."}</p>}
    <CatalogForm key={`${item?.version ?? 0}:${q ?? ""}`} kind="professional" id={item?.id ?? randomUUID()} requestId={randomUUID()}
      version={item?.version ?? 0} users={users} cancelHref="/configuracoes/profissionais"
      initial={{ name: item?.name ?? "", userId: item?.userId ?? "", purpose: item?.purpose ?? "AMBOS", councilCode: item?.councilCode ?? "",
        councilNumber: item?.councilNumber ?? "", councilState: item?.councilState ?? "", occupationCode: item?.occupationCode ?? "", active: String(item?.active ?? true) }} />
    {item && <ConfigHistory changes={item.changes} />}</div>;
}
