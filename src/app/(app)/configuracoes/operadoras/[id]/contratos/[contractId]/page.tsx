import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContractConfiguration } from "@/modules/administrativo/queries";
import { contractPendingFields } from "@/modules/administrativo/validation";
import { ConfigForm } from "../../../config-form";
import { ConfigHistory } from "../../../history";

export default async function ContratoPage({ params }: { params: Promise<{ id: string; contractId: string }> }) {
  const { id, contractId } = await params;
  const contract = await getContractConfiguration(contractId);
  if (!contract || contract.operatorId !== id) notFound();
  const pending = contractPendingFields(contract, contract.operator.registrationAns);
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
    <h1 className="break-words text-2xl font-semibold">{contract.name}</h1>
    <p className="text-sm text-muted-foreground">Operadora: {contract.operator.name}. Homologação pendente; informar uma versão não valida o XML.</p>
    {pending.length > 0 && <p role="status" className="rounded-lg border p-3 text-sm">Dados pendentes: {pending.join(", ")}.</p>}
    {!contract.operator.active && <p role="status" className="text-sm">A operadora está inativa. Reative-a antes de ativar o contrato.</p>}
    <ConfigForm key={contract.version} kind="contract" id={contract.id} operatorId={id} requestId={randomUUID()} expectedVersion={contract.version}
      initial={{ name: contract.name, providerCode: contract.providerCode ?? "", cnes: contract.cnes ?? "", tissVersion: contract.tissVersion ?? "", manualReference: contract.manualReference ?? "", homologationChannel: contract.homologationChannel ?? "", monthlySessions: String(contract.monthlySessions), closingIntervalDays: String(contract.closingIntervalDays), maxGuides: String(contract.maxGuides), maxItems: String(contract.maxItems), maxXmlBytes: String(contract.maxXmlBytes), maxExportRows: String(contract.maxExportRows), active: String(contract.active), reason: "" }}
      cancelHref={`/configuracoes/operadoras/${id}`} />
    <Link href={`/configuracoes/procedimentos?contrato=${contract.id}`} className="rounded border p-3 underline">Catálogo de procedimentos e tarifas</Link>
    <Link href={`/configuracoes/perfis-guia/${contract.id}`} className="rounded border p-3 underline">Perfil de campos da guia SP/SADT</Link>
    <ConfigHistory changes={contract.changes} />
  </div>;
}
