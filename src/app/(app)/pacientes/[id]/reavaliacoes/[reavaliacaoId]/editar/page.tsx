import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";
import { updateReassessment } from "@/modules/clinico/reassessment-actions";
import { getReassessment, listReassessmentChanges } from "@/modules/clinico/reassessment-queries";
import { getPatient } from "@/modules/pacientes/queries";
import { formatDate } from "../../../../format";
import { ReassessmentForm } from "../../reassessment-form";
import { ReassessmentHistory } from "../../reassessment-view";

export const metadata: Metadata = { title: "Corrigir reavaliação — TechLab+ Fisio OrtoSport" };

export default async function EditarReavaliacaoPage({
  params,
}: PageProps<"/pacientes/[id]/reavaliacoes/[reavaliacaoId]/editar">) {
  await requirePermission("clinico:gerir");
  const { id, reavaliacaoId } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const reassessment = await getReassessment(patient.id, reavaliacaoId);
  if (!reassessment) notFound();

  const detail = `/pacientes/${patient.id}/reavaliacoes/${reassessment.id}`;
  // A action também recusa; aqui só evitamos exibir um formulário que não pode ser salvo.
  if (patient.status !== "ATIVO") redirect(detail);

  const changes = await listReassessmentChanges(patient.id, reassessment.id);
  const text = (value: string | null) => value ?? "";

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={detail} className="text-sm text-muted-foreground hover:text-foreground">
          ← Reavaliação
        </Link>
        <h2 className="text-xl font-semibold tracking-tight">
          Corrigir reavaliação de {formatDate(reassessment.reassessmentDate)}
        </h2>
        <p className="text-sm text-muted-foreground">
          Plano, revisão de referência e comparação não mudam. Cada campo alterado fica no histórico, com o valor anterior,
          o motivo, a data e quem corrigiu.
        </p>
      </div>
      <ReassessmentForm
        key={reassessment.version}
        action={updateReassessment.bind(null, patient.id, reassessment.id)}
        initial={{
          reassessmentDate: reassessment.reassessmentDate.toISOString().slice(0, 10),
          inspection: text(reassessment.inspection),
          palpation: text(reassessment.palpation),
          functionalGait: text(reassessment.functionalGait),
          rangeOfMotion: text(reassessment.rangeOfMotion),
          muscleStrength: text(reassessment.muscleStrength),
          specialTests: text(reassessment.specialTests),
          painLimitations: text(reassessment.painLimitations),
          progressSummary: reassessment.progressSummary,
          goalsStatus: reassessment.goalsStatus,
          goalsJustification: reassessment.goalsJustification,
          conclusion: reassessment.conclusion,
          conclusionSummary: reassessment.conclusionSummary,
        }}
        mode={{ kind: "edit", version: reassessment.version }}
        cancelHref={detail}
        submitLabel="Salvar correção"
      />
      <details className="rounded-xl border">
        <summary className="cursor-pointer rounded-xl p-4 text-sm font-medium hover:bg-muted/50">Histórico de correções</summary>
        <div className="border-t p-4">
          <ReassessmentHistory changes={changes} />
        </div>
      </details>
    </div>
  );
}
