import type { PatientFormValues } from "./patient-form";
import type { PatientDetail } from "@/modules/pacientes/queries";
import { ageOn, maskCpf, maskPhone } from "@/modules/pacientes/validation";

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
    // Cadastros anteriores à Fase 2c não têm sexo: a edição exige escolher.
    sex: patient.sex ?? "",
    occupation: patient.occupation ?? "",
    cpf: maskCpf(patient.cpf ?? ""),
    phone: maskPhone(patient.phone),
    email: patient.email ?? "",
    address: patient.address ?? "",
    notes: patient.notes ?? "",
    guardianName: patient.guardianName ?? "",
    guardianPhone: maskPhone(patient.guardianPhone ?? ""),
    guardianRelationship: patient.guardianRelationship ?? "",
  };
}
