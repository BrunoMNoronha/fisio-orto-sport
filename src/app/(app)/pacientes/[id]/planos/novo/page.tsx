import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";
import { toLocalDate } from "@/modules/agenda/validation";
import { createPlan } from "@/modules/clinico/plan-actions";
import { listPlanOriginOptions } from "@/modules/clinico/plan-queries";
import { getPatient } from "@/modules/pacientes/queries";
import { firstParam } from "@/modules/pacientes/validation";
import { formatDate } from "../../../format";
import { EMPTY_PLAN, PlanForm } from "../plan-form";

export const metadata: Metadata = { title: "Novo plano terapêutico — TechLab+ Fisio OrtoSport" };

// `?avaliacao=<id>` pré-seleciona a avaliação de origem (atalho a partir do detalhe da avaliação).
export default async function NovoPlanoPage({ params, searchParams }: PageProps<"/pacientes/[id]/planos/novo">) {
  await requirePermission("clinico:gerir");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const base = `/pacientes/${patient.id}/planos`;
  // A action também recusa; aqui só evitamos exibir um formulário que não pode ser salvo.
  if (patient.status !== "ATIVO") redirect(base);

  const assessments = await listPlanOriginOptions(patient.id);
  if (assessments.length === 0) redirect(base);

  const requested = firstParam((await searchParams).avaliacao);
  // Só aceita uma avaliação deste paciente; qualquer outro id cai na mais recente.
  const selected = assessments.find((item) => item.id === requested) ?? assessments[0];
  const origins = assessments.map((item, index) => ({
    id: item.id,
    label: `Avaliação inicial de ${formatDate(item.assessmentDate)}${index === 0 ? " (mais recente)" : ""}`,
    diagnosis: item.diagnosis,
    therapeuticGoals: item.therapeuticGoals,
  }));

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">
          ← Planos terapêuticos
        </Link>
        <h2 className="text-xl font-semibold tracking-tight">Novo plano terapêutico</h2>
      </div>
      <PlanForm
        action={createPlan.bind(null, patient.id)}
        initial={{ ...EMPTY_PLAN, planDate: toLocalDate(new Date()), goals: selected.therapeuticGoals ?? "" }}
        mode={{ kind: "create", origins, initialAssessmentId: selected.id }}
        cancelHref={base}
        submitLabel="Salvar plano"
      />
    </div>
  );
}
