import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getProcedure } from "@/modules/administrativo/catalog-queries";
import { CatalogForm } from "../../catalog-form";
export default async function NewTariff({ searchParams }: { searchParams: Promise<{ procedimento?: string }> }) {
  const { procedimento } = await searchParams;
  const item = await getProcedure(procedimento ?? "");
  if (!item) notFound();
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5"><h1 className="text-2xl font-semibold">Nova tarifa</h1>
    <p>{item.code} · {item.name}</p><CatalogForm kind="tariff" id={randomUUID()} requestId={randomUUID()} version={0}
      parentId={item.id} initial={{ active: "true" }} cancelHref={`/configuracoes/procedimentos/${item.id}`} /></div>;
}
