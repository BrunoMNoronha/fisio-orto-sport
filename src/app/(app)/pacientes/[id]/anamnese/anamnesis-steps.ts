import type { FieldErrors } from "@/modules/auth/validation";
import type { AnamnesisFormValues } from "./anamnesis-form";

export type AnamnesisField = keyof AnamnesisFormValues | "painTypes";

export type AnamnesisStep = { id: string; title: string; fields: readonly AnamnesisField[] };

// Agrupamento único da anamnese: usado nas etapas do formulário e nas seções da visualização.
export const ANAMNESIS_STEPS = [
  {
    id: "queixa",
    title: "Queixa principal",
    fields: ["assessmentDate", "chiefComplaint", "currentIllnessHistory"],
  },
  {
    id: "dor",
    title: "Dor",
    fields: ["painIntensity", "painLocation", "painTypes"],
  },
  {
    id: "historico",
    title: "Histórico clínico",
    fields: ["personalPathologicalHistory", "surgeries", "currentMedications", "habitsPhysicalActivity"],
  },
  {
    id: "funcional",
    title: "Funcional e objetivos",
    fields: ["functionalLimitations", "patientGoals", "clinicalNotes"],
  },
] as const satisfies readonly AnamnesisStep[];

export function stepHasError(step: AnamnesisStep, errors: FieldErrors | undefined) {
  return step.fields.some((field) => errors?.[field]?.length);
}

// Índice da primeira etapa com erro de validação, ou -1 quando não há erro de campo.
export function firstStepWithError(errors: FieldErrors | undefined) {
  return ANAMNESIS_STEPS.findIndex((step) => stepHasError(step, errors));
}
