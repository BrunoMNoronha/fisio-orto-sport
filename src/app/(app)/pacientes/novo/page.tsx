import type { Metadata } from "next";
import { requirePermission } from "@/modules/auth/dal";
import { createPatient } from "@/modules/pacientes/actions";
import { PatientForm } from "../patient-form";

export const metadata: Metadata = { title: "Novo paciente — TechLab+ Fisio OrtoSport" };

export default async function NovoPacientePage() {
  await requirePermission("pacientes:gerir");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Novo paciente</h1>
      <PatientForm action={createPatient} cancelHref="/pacientes" submitLabel="Cadastrar paciente" />
    </main>
  );
}
