import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";
import { revisePlan } from "@/modules/clinico/plan-actions";
import { getPlan, type PlanRevisionDetail } from "@/modules/clinico/plan-queries";
import { getPatient } from "@/modules/pacientes/queries";
import { formatDate } from "../../../../format";
import { PlanForm, type PlanFormValues } from "../../plan-form";

export const metadata: Metadata = { title: "Revisar plano terapêutico — TechLab+ Fisio OrtoSport" };

// A nova revisão parte do conteúdo da vigente.
function toFormValues(revision: PlanRevisionDetail): PlanFormValues {
  const text = (value: string | null) => value ?? "";
  return {
    planDate: revision.planDate.toISOString().slice(0, 10),
    goals: revision.goals,
    conduct: revision.conduct,
    techniques: text(revision.techniques),
    exercises: text(revision.exercises),
    plannedSessions: revision.plannedSessions?.toString() ?? "",
    frequency: text(revision.frequency),
    reassessment: text(revision.reassessment),
    notes: text(revision.notes),
  };
}

export default async function RevisarPlanoPage({ params }: PageProps<"/pacientes/[id]/planos/[planoId]/revisar">) {
  await requirePermission("clinico:gerir");
  const { id, planoId } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const plan = await getPlan(patient.id, planoId);
  if (!plan) notFound();

  const detail = `/pacientes/${patient.id}/planos/${plan.id}`;
  // A action também recusa; aqui só evitamos exibir um formulário que não pode ser salvo.
  if (patient.status !== "ATIVO" || plan.status !== "ATIVO") redirect(detail);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={detail} className="text-sm text-muted-foreground hover:text-foreground">
          ← Plano terapêutico
        </Link>
        <h2 className="text-xl font-semibold tracking-tight">Revisar plano de {formatDate(plan.current.planDate)}</h2>
        <p className="text-sm text-muted-foreground">
          Parte da revisão vigente ({plan.currentRevision}). Salvar cria a revisão {plan.currentRevision + 1}; as anteriores
          ficam preservadas.
        </p>
      </div>
      {/* key: se outra revisão for gravada, o formulário remonta a partir da nova vigente. */}
      <PlanForm
        key={plan.currentRevision}
        action={revisePlan.bind(null, patient.id, plan.id)}
        initial={toFormValues(plan.current)}
        mode={{ kind: "revise", baseRevision: plan.currentRevision }}
        cancelHref={detail}
        submitLabel="Salvar revisão"
      />
    </div>
  );
}
