import type { Metadata } from "next";
import { requirePermission } from "@/modules/auth/dal";
import { createAppointment } from "@/modules/agenda/actions";
import { getActivePatientOption, listProfessionals } from "@/modules/agenda/queries";
import { isValidDate, isValidTime, toLocalDate } from "@/modules/agenda/validation";
import { firstParam } from "@/modules/pacientes/validation";
import { AppointmentForm } from "../appointment-form";

export const metadata: Metadata = { title: "Novo agendamento — TechLab+ Fisio OrtoSport" };

export default async function NovoAgendamentoPage({ searchParams }: PageProps<"/agenda/novo">) {
  await requirePermission("agenda:gerir");
  const raw = await searchParams;
  const date = firstParam(raw.date);
  const professionalId = firstParam(raw.professionalId);
  const start = firstParam(raw.start);
  // Paciente vem da busca no formulário; o ?patientId= só pré-seleciona um paciente ativo.
  const [patient, professionals] = await Promise.all([
    getActivePatientOption(firstParam(raw.patientId)),
    listProfessionals(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Novo agendamento</h1>
      <AppointmentForm
        action={createAppointment}
        initial={{
          patientId: patient?.id ?? "",
          professionalId: professionals.some((p) => p.id === professionalId) ? (professionalId ?? "") : "",
          date: date && isValidDate(date) ? date : toLocalDate(new Date()),
          startTime: start && isValidTime(start) ? start : "",
          endTime: "",
          notes: "",
        }}
        patientPicker={{ initial: patient }}
        professionals={professionals.map((p) => ({ id: p.id, label: p.name }))}
        cancelHref="/agenda"
        submitLabel="Agendar"
      />
    </div>
  );
}
