import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";
import { updateAssessment } from "@/modules/clinico/assessment-actions";
import { getAssessment, listAssessmentChanges, type AssessmentDetail } from "@/modules/clinico/assessment-queries";
import { getPatient } from "@/modules/pacientes/queries";
import { formatDate } from "../../../../format";
import { AssessmentForm, type AssessmentFormValues } from "../../assessment-form";
import { AssessmentHistory } from "../../assessment-view";

export const metadata: Metadata = { title: "Editar avaliação — TechLab+ Fisio OrtoSport" };

function toFormValues(assessment: AssessmentDetail): AssessmentFormValues {
  const text = (value: string | null) => value ?? "";
  return {
    assessmentDate: assessment.assessmentDate.toISOString().slice(0, 10),
    inspection: text(assessment.inspection),
    palpation: text(assessment.palpation),
    functionalGait: text(assessment.functionalGait),
    rangeOfMotion: text(assessment.rangeOfMotion),
    muscleStrength: text(assessment.muscleStrength),
    specialTests: text(assessment.specialTests),
    diagnosis: assessment.diagnosis,
    therapeuticGoals: text(assessment.therapeuticGoals),
    clinicalNotes: text(assessment.clinicalNotes),
  };
}

export default async function EditarAvaliacaoPage({
  params,
}: PageProps<"/pacientes/[id]/avaliacoes/[avaliacaoId]/editar">) {
  await requirePermission("clinico:gerir");
  const { id, avaliacaoId } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const assessment = await getAssessment(patient.id, avaliacaoId);
  if (!assessment) notFound();

  const detail = `/pacientes/${patient.id}/avaliacoes/${assessment.id}`;
  // A action também recusa; aqui só evitamos exibir um formulário que não pode ser salvo.
  if (patient.status !== "ATIVO") redirect(detail);

  const changes = await listAssessmentChanges(patient.id, assessment.id);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={detail} className="text-sm text-muted-foreground hover:text-foreground">
          ← Avaliação
        </Link>
        <h2 className="text-xl font-semibold tracking-tight">
          Editar avaliação inicial de {formatDate(assessment.assessmentDate)}
        </h2>
        <p className="text-sm text-muted-foreground">
          Cada campo alterado fica no histórico, com o valor anterior, a data e quem editou.
        </p>
      </div>

      {/* key: numa nova versão da avaliação, o formulário remonta com os valores atuais. */}
      <AssessmentForm
        key={assessment.version}
        action={updateAssessment.bind(null, patient.id, assessment.id)}
        initial={toFormValues(assessment)}
        version={assessment.version}
        cancelHref={detail}
        submitLabel="Salvar alterações"
      />

      <details className="rounded-xl border">
        <summary className="cursor-pointer rounded-xl p-4 text-sm font-medium hover:bg-muted/50">
          Histórico de alterações
        </summary>
        <div className="border-t p-4">
          <AssessmentHistory changes={changes} />
        </div>
      </details>
    </div>
  );
}
