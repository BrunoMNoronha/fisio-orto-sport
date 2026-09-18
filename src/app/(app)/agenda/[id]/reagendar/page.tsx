import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";
import { rescheduleAppointment } from "@/modules/agenda/actions";
import { getAppointment, listProfessionals } from "@/modules/agenda/queries";
import { toLocalDate, toLocalTime } from "@/modules/agenda/validation";
import { AppointmentForm } from "../../appointment-form";

export const metadata: Metadata = { title: "Reagendar — TechLab+ Fisio OrtoSport" };

export default async function ReagendarPage({ params }: PageProps<"/agenda/[id]/reagendar">) {
  await requirePermission("agenda:gerir");
  const { id } = await params;
  const [appointment, professionals] = await Promise.all([getAppointment(id), listProfessionals()]);
  if (!appointment) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <Link href={`/agenda/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← Agendamento
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Reagendar</h1>
      {appointment.status !== "AGENDADO" ? (
        <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
          Agendamento cancelado não pode ser reagendado.
        </p>
      ) : (
        <AppointmentForm
          action={rescheduleAppointment}
          appointmentId={id}
          patientName={appointment.patient.fullName}
          initial={{
            patientId: appointment.patient.id,
            professionalId: appointment.professional.id,
            date: toLocalDate(appointment.startsAt),
            startTime: toLocalTime(appointment.startsAt),
            endTime: toLocalTime(appointment.endsAt),
            notes: "",
          }}
          professionals={professionals.map((p) => ({ id: p.id, label: p.name }))}
          cancelHref={`/agenda/${id}`}
          submitLabel="Salvar novo horário"
        />
      )}
    </main>
  );
}
