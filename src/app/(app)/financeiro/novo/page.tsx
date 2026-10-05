import type { Metadata } from "next";
import { requirePermission } from "@/modules/auth/dal";
import { createChargeAction } from "@/modules/financeiro/actions";
import { getChargePatientOption } from "@/modules/financeiro/queries";
import { firstParam } from "@/modules/pacientes/validation";
import { ChargeForm } from "../charge-form";

export const metadata: Metadata = { title: "Nova cobrança — TechLab+ Fisio OrtoSport" };

export default async function NovaCobrancaPage({ searchParams }: PageProps<"/financeiro/novo">) {
  await requirePermission("financeiro:gerir");
  // Paciente vem da busca no formulário; o ?patientId= só pré-seleciona.
  const patient = await getChargePatientOption(firstParam((await searchParams).patientId));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Nova cobrança</h1>
        <p className="text-sm text-muted-foreground">
          Depois de lançada, a cobrança não é editada: para corrigir, use &quot;Substituir&quot; no detalhe.
        </p>
      </div>
      <ChargeForm
        action={createChargeAction}
        requestId={crypto.randomUUID()}
        initialPatient={patient}
        initial={{ description: "", amount: "", dueDate: "", reason: "" }}
        cancelHref={patient ? `/financeiro?patientId=${patient.id}` : "/financeiro"}
        submitLabel="Lançar cobrança"
      />
    </div>
  );
}
