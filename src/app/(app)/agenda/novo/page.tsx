import type { Metadata } from "next";
import { requirePermission } from "@/modules/auth/dal";
import { createAppointment } from "@/modules/agenda/actions";
import { listActivePatientOptions, listProfessionals } from "@/modules/agenda/queries";
import { isValidDate, toLocalDate } from "@/modules/agenda/validation";
import { firstParam } from "@/modules/pacientes/validation";
import { AppointmentForm } from "../appointment-form";

export const metadata: Metadata = { title: "Novo agendamento — TechLab+ Fisio OrtoSport" };

export default async function NovoAgendamentoPage({ searchParams }: PageProps<"/agenda/novo">) {
  await requirePermission("agenda:gerir");
  const raw = await searchParams;
  const [patients, professionals] = await Promise.all([listActivePatientOptions(), listProfessionals()]);

  const date = firstParam(raw.date);
  const professionalId = firstParam(raw.professionalId);
  const patientId = firstParam(raw.patientId);

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Novo agendamento</h1>
      <AppointmentForm
        action={createAppointment}
        initial={{
          patientId: patients.some((p) => p.id === patientId) ? (patientId ?? "") : "",
          professionalId: professionals.some((p) => p.id === professionalId) ? (professionalId ?? "") : "",
          date: date && isValidDate(date) ? date : toLocalDate(new Date()),
          startTime: "",
          endTime: "",
          notes: "",
        }}
        patients={patients.map((p) => ({ id: p.id, label: p.fullName }))}
        professionals={professionals.map((p) => ({ id: p.id, label: p.name }))}
        cancelHref="/agenda"
        submitLabel="Agendar"
      />
    </div>
  );
}
