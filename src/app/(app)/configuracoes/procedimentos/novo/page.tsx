import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getContractConfiguration } from "@/modules/administrativo/queries";
import { CatalogForm } from "../../catalog-form";
export default async function NewProcedure({ searchParams }: { searchParams: Promise<{ contrato?: string }> }) {
  const { contrato } = await searchParams;
  const parent = await getContractConfiguration(contrato ?? "");
  if (!parent) notFound();
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-5"><h1 className="text-2xl font-semibold">Novo procedimento</h1>
    <p>{parent.operator.name} · {parent.name}</p>
    <CatalogForm kind="procedure" id={randomUUID()} requestId={randomUUID()} version={0} parentId={parent.id}
      initial={{ active: "true" }} cancelHref={`/configuracoes/procedimentos?contrato=${parent.id}`} /></div>;
}
