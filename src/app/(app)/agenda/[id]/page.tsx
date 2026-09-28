import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { OUTSIDE_BADGE, isOutsideBusinessHours } from "@/modules/agenda/business-hours";
import { getAppointment } from "@/modules/agenda/queries";
import { APPOINTMENT_ATTENDANCE_LABELS, APPOINTMENT_STATUS_LABELS, toLocalDate } from "@/modules/agenda/validation";
import { getAgendaPreferences } from "@/modules/configuracoes/queries";
import { AttendanceForm } from "../attendance-form";
import { CancelAppointmentForm } from "../cancel-appointment-form";
import { agendaHref, formatDateTime, formatDay, formatTime } from "../format";

export const metadata: Metadata = { title: "Agendamento — TechLab+ Fisio OrtoSport" };

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{value || "—"}</dd>
    </div>
  );
}

export default async function AgendamentoPage({ params }: PageProps<"/agenda/[id]">) {
  const actor = await requirePermission("agenda:ler");
  const canManage = can(actor.role, "agenda:gerir");
  const { id } = await params;
  const [appointment, preferences] = await Promise.all([getAppointment(id), getAgendaPreferences()]);
  if (!appointment) notFound();
  // Salvo fora do expediente em vigor: continua consultável, cancelável e com presença; só é avisado.
  const outside = isOutsideBusinessHours(preferences.businessHours, appointment);

  const active = appointment.status === "AGENDADO";
  const cancelledBy = appointment.cancelledBy ? ` por ${appointment.cancelledBy.name}` : "";
  // MEL-01: presença e atendimento vinculado. A agenda sabe só se há atendimento válido (id), nunca o
  // conteúdo clínico; o link para ele aparece apenas para quem tem `clinico:ler`.
  const started = appointment.startsAt.getTime() <= new Date().getTime();
  const sessionId = appointment.sessions[0]?.id ?? null;
  const locked = sessionId !== null || appointment.attendance !== null;
  const canRegisterSession =
    can(actor.role, "clinico:gerir") &&
    active &&
    started &&
    !sessionId &&
    (appointment.attendance === null || appointment.attendance === "COMPARECEU") &&
    (actor.role !== "FISIOTERAPEUTA" || appointment.professional.id === actor.id);
  const attendanceText = appointment.attendance
    ? `${APPOINTMENT_ATTENDANCE_LABELS[appointment.attendance]}${
        appointment.attendanceMarkedAt
          ? ` — marcada${appointment.attendanceMarkedBy ? ` por ${appointment.attendanceMarkedBy.name}` : ""} em ${formatDateTime(appointment.attendanceMarkedAt)}`
          : ""
      }`
    : started
      ? "Não marcada"
      : "Disponível a partir do início do horário";

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link href="/agenda" className="text-sm text-muted-foreground hover:text-foreground">
          ← Agenda
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Agendamento</h1>
            <Badge variant={active ? "secondary" : "outline"}>{APPOINTMENT_STATUS_LABELS[appointment.status]}</Badge>
            {outside && <Badge variant="outline">{OUTSIDE_BADGE}</Badge>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={agendaHref({
                view: "dia",
                date: toLocalDate(appointment.startsAt),
                professionalId: appointment.professional.id,
              })}
              className={buttonVariants({ variant: "ghost" })}
            >
              Ver na agenda do dia
            </Link>
            {canRegisterSession && (
              <Link
                href={`/pacientes/${appointment.patient.id}/sessoes/nova?agendamento=${id}`}
                className={buttonVariants()}
              >
                Registrar atendimento
              </Link>
            )}
            {canManage && active && !locked && (
              <Link href={`/agenda/${id}/reagendar`} className={buttonVariants({ variant: "outline" })}>
                Reagendar
              </Link>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-lg font-semibold first-letter:uppercase">{formatDay(appointment.startsAt)}</p>
            <p className="text-2xl font-semibold tabular-nums text-primary">
              {formatTime(appointment.startsAt)} – {formatTime(appointment.endsAt)}
            </p>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Item
              label="Paciente"
              value={
                <Link href={`/pacientes/${appointment.patient.id}`} className="underline-offset-4 hover:underline">
                  {appointment.patient.fullName}
                </Link>
              }
            />
            <Item label="Profissional" value={appointment.professional.name} />
            <div className="sm:col-span-2">
              <Item label="Observação administrativa" value={appointment.notes} />
            </div>
            {active && <Item label="Presença" value={attendanceText} />}
            <Item
              label="Atendimento"
              value={
                sessionId ? (
                  can(actor.role, "clinico:ler") ? (
                    <Link
                      href={`/pacientes/${appointment.patient.id}/sessoes/${sessionId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      Registrado — ver atendimento
                    </Link>
                  ) : (
                    "Registrado"
                  )
                ) : (
                  "Não registrado"
                )
              }
            />
            {!active && (
              <>
                <Item
                  label="Cancelado em"
                  value={appointment.cancelledAt ? `${formatDateTime(appointment.cancelledAt)}${cancelledBy}` : null}
                />
                <Item label="Motivo do cancelamento" value={appointment.cancelReason} />
              </>
            )}
            <Item label="Criado por" value={`${appointment.createdBy.name} em ${formatDateTime(appointment.createdAt)}`} />
          </dl>
        </CardContent>
      </Card>

      {canManage && active && started && !sessionId && (
        <AttendanceForm key={appointment.attendance ?? ""} id={id} current={appointment.attendance} />
      )}
      {canManage && active && sessionId && (
        <p className="text-sm text-muted-foreground">
          Há atendimento registrado: a presença fica como compareceu e o agendamento não pode ser cancelado nem
          reagendado. Se o atendimento foi lançado por engano, ele precisa ser invalidado antes.
        </p>
      )}
      {canManage && active && !sessionId && appointment.attendance && (
        <p className="text-sm text-muted-foreground">
          Com presença marcada, o agendamento não pode ser cancelado nem reagendado. Remova a marcação antes, se
          necessário.
        </p>
      )}
      {canManage && active && !locked && <CancelAppointmentForm id={id} />}
    </div>
  );
}
