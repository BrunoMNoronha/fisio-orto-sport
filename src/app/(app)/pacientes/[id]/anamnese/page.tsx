import { ActionLink } from "@/components/action-link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { getCurrentAnamnesis } from "@/modules/clinico/queries";
import { getPatient } from "@/modules/pacientes/queries";
import { AnamnesisView } from "./anamnesis-view";

// Metadata genérica: nunca inclui nome do paciente nem conteúdo clínico.
export const metadata: Metadata = { title: "Anamnese — TechLab+ Fisio OrtoSport" };

export default async function AnamnesePage({ params }: PageProps<"/pacientes/[id]/anamnese">) {
  const actor = await requirePermission("clinico:ler");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const anamnesis = await getCurrentAnamnesis(patient.id);
  const active = patient.status === "ATIVO";
  const canRegister = can(actor.role, "clinico:gerir") && active;
  const base = `/pacientes/${patient.id}/anamnese`;

  return (
    <div className="w-full max-w-3xl flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight">Anamnese</h2>
          <div className="flex gap-3">
            {anamnesis && (
              <ActionLink help="Exibe as versões anteriores da anamnese, preservadas no histórico." href={`${base}/historico`} className={buttonVariants({ variant: "outline" })}>
                Histórico de versões
              </ActionLink>
            )}
            {canRegister && anamnesis && (
              <ActionLink help="Abre o formulário de uma nova anamnese do paciente." href={`${base}/nova`} className={buttonVariants()}>
                Nova versão
              </ActionLink>
            )}
          </div>
        </div>
      </div>

      {!active && (
        <Alert>
          <AlertDescription>
            Paciente inativo: a anamnese pode ser consultada, mas novas versões só podem ser registradas após a
            reativação do cadastro.
          </AlertDescription>
        </Alert>
      )}

      {anamnesis ? (
        <AnamnesisView anamnesis={anamnesis} />
      ) : (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed p-6">
          <p className="text-sm text-muted-foreground">Nenhuma anamnese registrada para este paciente.</p>
          {canRegister && (
            <ActionLink help="Abre o formulário de uma nova anamnese do paciente." href={`${base}/nova`} className={buttonVariants()}>
              Registrar anamnese
            </ActionLink>
          )}
        </div>
      )}
    </div>
  );
}
