import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getTariff } from "@/modules/administrativo/catalog-queries";
import { CatalogForm } from "../../catalog-form";
import { ConfigHistory } from "../../operadoras/history";
export default async function Tariff({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getTariff(id);
  if (!item) notFound();
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5"><h1 className="text-2xl font-semibold">Editar tarifa</h1>
    <p>{item.procedure.code} · {item.procedure.name}</p>
    <CatalogForm key={item.version} kind="tariff" id={id} requestId={randomUUID()} version={item.version} parentId={item.procedureId}
      initial={{ amount: (item.amountCents / 100).toFixed(2).replace(".", ","), startsOn: item.startsOn.toISOString().slice(0,10),
        endsOn: item.endsOn?.toISOString().slice(0,10) ?? "", active: String(item.active) }} cancelHref={`/configuracoes/procedimentos/${item.procedureId}`} />
    <ConfigHistory changes={item.changes} /></div>;
}
