import type { FieldErrors } from "@/modules/auth/validation";
import type { AnamnesisFormValues } from "./anamnesis-form";

export type AnamnesisField = keyof AnamnesisFormValues | "painTypes";

export type AnamnesisStep = {
  id: string;
  title: string;
  fields: readonly AnamnesisField[];
  // Campos que marcam a etapa como preenchida; padrão: todos os `fields`.
  filledBy?: readonly AnamnesisField[];
};

// Agrupamento único da anamnese: usado nas etapas do formulário e nas seções da visualização.
export const ANAMNESIS_STEPS = [
  {
    id: "queixa",
    title: "Queixa principal",
    fields: ["assessmentDate", "chiefComplaint", "currentIllnessHistory"],
    // A data já vem preenchida: só a queixa indica que a etapa foi preenchida.
    filledBy: ["chiefComplaint"],
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

// Primeiro campo com erro, na ordem das etapas e dos campos; null quando não há erro de campo.
export function firstFieldWithError(errors: FieldErrors | undefined): { step: number; field: AnamnesisField } | null {
  for (const [step, { fields }] of ANAMNESIS_STEPS.entries()) {
    const field = fields.find((name: AnamnesisField) => errors?.[name]?.length);
    if (field) return { step, field };
  }
  return null;
}
