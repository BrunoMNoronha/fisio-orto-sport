import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";
import { toLocalDate, toLocalTime } from "@/modules/agenda/validation";
import { REVISION_KIND_LABELS } from "@/modules/clinico/plan-validation";
import { createSession } from "@/modules/clinico/session-actions";
import { listProfessionalOptions, listSessionPlanOptions } from "@/modules/clinico/session-queries";
import { getPatient } from "@/modules/pacientes/queries";
import { firstParam } from "@/modules/pacientes/validation";
import { formatDate } from "../../../format";
import { professionalLabel } from "../professional-label";
import { EMPTY_SESSION, SessionForm } from "../session-form";

export const metadata: Metadata = { title: "Nova sessão — TechLab+ Fisio OrtoSport" };

// `?plano=<id>` pré-seleciona o plano (atalho a partir do detalhe do plano).
export default async function NovaSessaoPage({ params, searchParams }: PageProps<"/pacientes/[id]/sessoes/nova">) {
  const actor = await requirePermission("clinico:gerir");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const base = `/pacientes/${patient.id}/sessoes`;
  // A action também recusa; aqui só evitamos exibir um formulário que não pode ser salvo.
  if (patient.status !== "ATIVO") redirect(base);

  const [plans, professionals] = await Promise.all([listSessionPlanOptions(patient.id), listProfessionalOptions()]);
  if (plans.length === 0) redirect(base);

  const requested = firstParam((await searchParams).plano);
  const initialPlan = plans.find((plan) => plan.id === requested) ?? plans[0];
  const choices = plans.map((plan) => {
    const current = plan.revisions.find((revision) => revision.number === plan.currentRevision) ?? plan.revisions[0];
    const start = plan.revisions[plan.revisions.length - 1];
    return {
      id: plan.id,
      label: `Plano de ${formatDate(start.planDate)} (revisão vigente ${plan.currentRevision})`,
      currentRevisionId: current.id,
      validSessions: plan.validSessions,
      plannedSessions: current.plannedSessions,
      revisions: plan.revisions.map((revision) => ({
        id: revision.id,
        label: `Revisão ${revision.number}, de ${formatDate(revision.planDate)} · ${REVISION_KIND_LABELS[revision.kind]}${
          revision.number === plan.currentRevision ? " (vigente)" : ""
        }`,
      })),
    };
  });
  const options = professionals.map((option) => ({ id: option.id, label: professionalLabel(option) }));
  // Fisioterapeuta registra como responsável por si; o Administrador escolhe o fisioterapeuta.
  const self = actor.role === "FISIOTERAPEUTA" ? options.find((option) => option.id === actor.id) : undefined;
  const now = new Date();

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">
          ← Sessões
        </Link>
        <h2 className="text-xl font-semibold tracking-tight">Registrar sessão</h2>
      </div>
      <SessionForm
        action={createSession.bind(null, patient.id)}
        initial={{
          ...EMPTY_SESSION,
          occurredDate: toLocalDate(now),
          occurredTime: toLocalTime(now),
          professionalId: self?.id ?? "",
        }}
        mode={{ kind: "create", requestId: crypto.randomUUID(), plans: choices, initialPlanId: initialPlan.id }}
        professionals={options}
        fixedProfessional={self}
        cancelHref={base}
        submitLabel="Salvar sessão"
      />
    </div>
  );
}
