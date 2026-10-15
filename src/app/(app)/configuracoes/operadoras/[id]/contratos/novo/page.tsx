import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getOperatorConfiguration } from "@/modules/administrativo/queries";
import { ConfigForm } from "../../../config-form";

export default async function NovoContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const operator = await getOperatorConfiguration(id);
  if (!operator) notFound();
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
    <h1 className="text-2xl font-semibold">Novo contrato</h1>
    <p className="break-words text-sm text-muted-foreground">Operadora: {operator.name}. Dados do prestador, versão e manual podem permanecer pendentes. Não salve dados pessoais ou credenciais no manual.</p>
    <ConfigForm kind="contract" id={randomUUID()} operatorId={id} requestId={randomUUID()} expectedVersion={0}
      initial={{ name: "", providerCode: "", cnes: "", tissVersion: "04.03.00", manualReference: "", active: String(operator.active), reason: "Cadastro inicial" }}
      cancelHref={`/configuracoes/operadoras/${id}`} />
  </div>;
}
