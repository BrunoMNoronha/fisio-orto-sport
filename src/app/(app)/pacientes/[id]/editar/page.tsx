import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";
import { updatePatient } from "@/modules/pacientes/actions";
import { getPatient } from "@/modules/pacientes/queries";
import { toFormValues } from "../../format";
import { PatientForm } from "../../patient-form";

export const metadata: Metadata = { title: "Editar paciente — TechLab+ Fisio OrtoSport" };

export default async function EditarPacientePage({ params }: PageProps<"/pacientes/[id]/editar">) {
  await requirePermission("pacientes:gerir");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Editar paciente</h1>
      <PatientForm
        action={updatePatient}
        initial={toFormValues(patient)}
        patientId={patient.id}
        cancelHref={`/pacientes/${patient.id}`}
        submitLabel="Salvar alterações"
      />
    </div>
  );
}
