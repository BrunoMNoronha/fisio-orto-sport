import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { getAppointment } from "@/modules/agenda/queries";
import { APPOINTMENT_STATUS_LABELS } from "@/modules/agenda/validation";
import { CancelAppointmentForm } from "../cancel-appointment-form";
import { formatDateTime, formatDay, formatTime } from "../format";

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
  const appointment = await getAppointment(id);
  if (!appointment) notFound();

  const active = appointment.status === "AGENDADO";
  const cancelledBy = appointment.cancelledBy ? ` por ${appointment.cancelledBy.name}` : "";

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
          </div>
          {canManage && active && (
            <Link href={`/agenda/${id}/reagendar`} className={buttonVariants({ variant: "outline" })}>
              Reagendar
            </Link>
          )}
        </div>
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
        <Item label="Data" value={formatDay(appointment.startsAt)} />
        <Item label="Horário" value={`${formatTime(appointment.startsAt)} – ${formatTime(appointment.endsAt)}`} />
        <div className="sm:col-span-2">
          <Item label="Observação administrativa" value={appointment.notes} />
        </div>
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

      {canManage && active && <CancelAppointmentForm id={id} />}
    </div>
  );
}
