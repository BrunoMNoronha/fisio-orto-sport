import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";
import { toLocalDate } from "@/modules/agenda/validation";
import { createReassessment } from "@/modules/clinico/reassessment-actions";
import { listReassessmentPlanOptions } from "@/modules/clinico/reassessment-queries";
import { listRecentPlanSessions } from "@/modules/clinico/session-queries";
import { formatOccurredAt } from "@/modules/clinico/session-validation";
import { getPatient } from "@/modules/pacientes/queries";
import { firstParam } from "@/modules/pacientes/validation";
import { formatDate } from "../../../format";
import { EMPTY_REASSESSMENT, ReassessmentForm } from "../reassessment-form";

export const metadata: Metadata = { title: "Nova reavaliação — TechLab+ Fisio OrtoSport" };

// `?plano=<id>` pré-seleciona o plano (atalho a partir do detalhe do plano).
export default async function NovaReavaliacaoPage({ params, searchParams }: PageProps<"/pacientes/[id]/reavaliacoes/nova">) {
  await requirePermission("clinico:gerir");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const base = `/pacientes/${patient.id}/reavaliacoes`;
  // A action também recusa; aqui só evitamos exibir um formulário que não pode ser salvo.
  if (patient.status !== "ATIVO") redirect(base);

  const plans = await listReassessmentPlanOptions(patient.id);
  if (plans.length === 0) redirect(base);

  const recent = await Promise.all(plans.map((plan) => listRecentPlanSessions(patient.id, plan.id, 3)));
  const choices = plans.map((plan, index) => ({
    id: plan.id,
    label: `Plano da avaliação de ${formatDate(plan.assessment.assessmentDate)} (revisão vigente ${plan.currentRevision})`,
    goalsLabel: `Objetivos da revisão ${plan.current.number} (${formatDate(plan.current.planDate)})`,
    goals: plan.current.goals,
    sessionsLabel:
      plan.validSessions === 0
        ? "Nenhuma sessão registrada neste plano (a reavaliação não exige sessões anteriores)."
        : `${plan.validSessions} ${plan.validSessions === 1 ? "sessão válida" : "sessões válidas"} neste plano. Mais recentes:`,
    recentSessions: recent[index].map((session) => ({
      id: session.id,
      label: `${formatOccurredAt(session.occurredAt)} · ${session.professionalNameSnapshot}`,
      evolution: session.evolution,
    })),
  }));
  const requested = firstParam((await searchParams).plano);
  const initialPlan = choices.find((plan) => plan.id === requested) ?? choices[0];

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">
          ← Reavaliações
        </Link>
        <h2 className="text-xl font-semibold tracking-tight">Nova reavaliação</h2>
      </div>
      <ReassessmentForm
        action={createReassessment.bind(null, patient.id)}
        initial={{ ...EMPTY_REASSESSMENT, reassessmentDate: toLocalDate(new Date()) }}
        mode={{ kind: "create", plans: choices, initialPlanId: initialPlan.id }}
        cancelHref={base}
        submitLabel="Salvar reavaliação"
      />
    </div>
  );
}
