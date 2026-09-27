import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/modules/auth/dal";
import { toLocalDate, toLocalTime } from "@/modules/agenda/validation";
import { REVISION_KIND_LABELS } from "@/modules/clinico/plan-validation";
import { createSession } from "@/modules/clinico/session-actions";
import {
  getAppointmentForSession,
  listProfessionalOptions,
  listSessionPlanOptions,
} from "@/modules/clinico/session-queries";
import { appointmentSessionBlocker, formatOccurredAt } from "@/modules/clinico/session-validation";
import { getPatient } from "@/modules/pacientes/queries";
import { firstParam } from "@/modules/pacientes/validation";
import { formatDate } from "../../../format";
import { professionalLabel } from "../professional-label";
import { EMPTY_SESSION, SessionForm } from "../session-form";

export const metadata: Metadata = { title: "Nova sessão — TechLab+ Fisio OrtoSport" };

// `?plano=<id>` pré-seleciona o plano (atalho a partir do detalhe do plano).
// `?agendamento=<id>` (MEL-01): registra o atendimento de um agendamento elegível; data, hora e
// profissional vêm do agendamento. Sem o parâmetro, é o lançamento sem agendamento (retroativo).
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

  const query = await searchParams;
  const requestedAppointment = firstParam(query.agendamento);
  const appointment = requestedAppointment ? await getAppointmentForSession(patient.id, requestedAppointment) : null;
  const now = new Date();
  const ownOnly = actor.role === "FISIOTERAPEUTA" && appointment !== null && appointment.professional.id !== actor.id;
  const blocker = requestedAppointment
    ? ownOnly
      ? "Como fisioterapeuta, você registra atendimentos dos seus próprios agendamentos."
      : appointmentSessionBlocker(appointment, patient.id, now)
    : null;
  if (requestedAppointment && (blocker || !appointment)) {
    return (
      <div className="flex w-full max-w-4xl flex-col gap-5">
        <div className="flex flex-col gap-1">
          <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">
            ← Sessões
          </Link>
          <h2 className="text-xl font-semibold tracking-tight">Registrar sessão</h2>
        </div>
        <Alert variant="destructive">
          <AlertDescription>{blocker}</AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          {appointment && (
            <Link href={`/agenda/${appointment.id}`} className={buttonVariants({ variant: "outline" })}>
              Voltar ao agendamento
            </Link>
          )}
          <Link href={`${base}/nova`} className={buttonVariants({ variant: "ghost" })}>
            Registrar sem agendamento
          </Link>
        </div>
      </div>
    );
  }

  const requested = firstParam(query.plano);
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
  // Vindo da agenda, o responsável é sempre o profissional do agendamento.
  const self = appointment
    ? { id: appointment.professional.id, label: professionalLabel(appointment.professional) }
    : actor.role === "FISIOTERAPEUTA"
      ? options.find((option) => option.id === actor.id)
      : undefined;
  const occurredFrom = appointment?.startsAt ?? now;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">
          ← Sessões
        </Link>
        <h2 className="text-xl font-semibold tracking-tight">Registrar sessão</h2>
        {appointment && (
          <p className="text-sm text-muted-foreground">
            Atendimento do agendamento de {formatOccurredAt(appointment.startsAt)} com {appointment.professional.name}.
            Ao salvar, a presença é registrada como compareceu.{" "}
            <Link href={`/agenda/${appointment.id}`} className="underline underline-offset-4">
              Ver agendamento
            </Link>
          </p>
        )}
      </div>
      <SessionForm
        action={createSession.bind(null, patient.id)}
        initial={{
          ...EMPTY_SESSION,
          occurredDate: toLocalDate(occurredFrom),
          occurredTime: toLocalTime(occurredFrom),
          professionalId: self?.id ?? "",
        }}
        mode={{
          kind: "create",
          requestId: crypto.randomUUID(),
          plans: choices,
          initialPlanId: initialPlan.id,
          appointmentId: appointment?.id,
        }}
        professionals={options}
        fixedProfessional={self}
        cancelHref={appointment ? `/agenda/${appointment.id}` : base}
        submitLabel="Salvar sessão"
      />
    </div>
  );
}
