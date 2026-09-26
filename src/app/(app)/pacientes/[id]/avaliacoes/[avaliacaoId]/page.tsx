import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { getAssessment, listAssessmentChanges } from "@/modules/clinico/assessment-queries";
import { getAnamnesisVersion } from "@/modules/clinico/queries";
import { getPatient } from "@/modules/pacientes/queries";
import { formatDate } from "../../../format";
import { AnamnesisView } from "../../anamnese/anamnesis-view";
import { AssessmentHistory, AssessmentView } from "../assessment-view";

export const metadata: Metadata = { title: "Avaliação — TechLab+ Fisio OrtoSport" };

export default async function AvaliacaoPage({ params }: PageProps<"/pacientes/[id]/avaliacoes/[avaliacaoId]">) {
  const actor = await requirePermission("clinico:ler");
  const { id, avaliacaoId } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  // Filtrada pelo paciente da URL: id de outro paciente responde 404, sem revelar que existe.
  const assessment = await getAssessment(patient.id, avaliacaoId);
  if (!assessment) notFound();

  const [anamnesis, changes] = await Promise.all([
    getAnamnesisVersion(patient.id, assessment.anamnesisId),
    listAssessmentChanges(patient.id, assessment.id),
  ]);
  const active = patient.status === "ATIVO";
  const canEdit = can(actor.role, "clinico:gerir") && active;
  const base = `/pacientes/${patient.id}/avaliacoes`;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">
          ← Avaliações
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">
            Avaliação inicial de {formatDate(assessment.assessmentDate)}
          </h2>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Link href={`${base}/${assessment.id}/editar`} className={buttonVariants({ variant: "outline" })}>
                Editar
              </Link>
              <Link
                href={`/pacientes/${patient.id}/planos/novo?avaliacao=${assessment.id}`}
                className={buttonVariants()}
              >
                Criar plano terapêutico
              </Link>
            </div>
          )}
        </div>
      </div>

      {!active && (
        <Alert>
          <AlertDescription>Paciente inativo: a avaliação pode ser consultada, mas não editada.</AlertDescription>
        </Alert>
      )}

      {anamnesis && (
        <details className="rounded-xl border">
          <summary className="cursor-pointer rounded-xl p-4 text-sm font-medium hover:bg-muted/50">
            Anamnese de referência ({formatDate(anamnesis.assessmentDate)})
          </summary>
          <div className="border-t p-4">
            <AnamnesisView anamnesis={anamnesis} />
          </div>
        </details>
      )}

      <AssessmentView assessment={assessment} />

      <section aria-labelledby="avaliacao-historico" className="flex flex-col gap-3">
        <h3 id="avaliacao-historico" className="font-heading text-base font-semibold">
          Histórico de alterações
        </h3>
        <AssessmentHistory changes={changes} />
      </section>
    </div>
  );
}
