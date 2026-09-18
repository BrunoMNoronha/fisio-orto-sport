import type { Metadata } from "next";
import { requirePermission } from "@/modules/auth/dal";
import { createPatient } from "@/modules/pacientes/actions";
import { PatientForm } from "../patient-form";

export const metadata: Metadata = { title: "Novo paciente — TechLab+ Fisio OrtoSport" };

export default async function NovoPacientePage() {
  await requirePermission("pacientes:gerir");

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Novo paciente</h1>
      <PatientForm action={createPatient} cancelHref="/pacientes" submitLabel="Cadastrar paciente" />
    </div>
  );
}
