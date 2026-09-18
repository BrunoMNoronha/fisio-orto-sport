import type { PatientFormValues } from "./patient-form";
import type { PatientDetail } from "@/modules/pacientes/queries";
import { ageOn } from "@/modules/pacientes/validation";

// birthDate é @db.Date (meia-noite UTC): formatar em UTC evita deslocar o dia.
export function formatDate(date: Date) {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function formatAge(birthDate: Date) {
  const age = ageOn(birthDate);
  return age === 1 ? "1 ano" : `${age} anos`;
}

export function toFormValues(patient: PatientDetail): PatientFormValues {
  return {
    fullName: patient.fullName,
    birthDate: patient.birthDate.toISOString().slice(0, 10),
    cpf: patient.cpf ?? "",
    phone: patient.phone,
    email: patient.email ?? "",
    address: patient.address ?? "",
    notes: patient.notes ?? "",
    guardianName: patient.guardianName ?? "",
    guardianPhone: patient.guardianPhone ?? "",
    guardianRelationship: patient.guardianRelationship ?? "",
  };
}
