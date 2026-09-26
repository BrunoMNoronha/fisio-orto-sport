import { z } from "zod";
import { toLocalDate } from "@/modules/agenda/validation";
import { isPlausibleId } from "./validation";

// Avaliação fisioterapêutica inicial (Fase 4). Os limites espelham os @db.VarChar do schema Prisma.
export const ASSESSMENT_LIMITS = {
  inspection: 4000,
  palpation: 4000,
  functionalGait: 4000,
  rangeOfMotion: 4000,
  muscleStrength: 4000,
  specialTests: 4000,
  diagnosis: 2000,
  therapeuticGoals: 2000,
  clinicalNotes: 4000,
} as const;

export const ASSESSMENT_PAGE_SIZE = 10;

// Campos clínicos editáveis, na ordem de exibição. A anamnese de referência é fixada na criação.
export const ASSESSMENT_FIELDS = [
  "assessmentDate",
  "inspection",
  "palpation",
  "functionalGait",
  "rangeOfMotion",
  "muscleStrength",
  "specialTests",
  "diagnosis",
  "therapeuticGoals",
  "clinicalNotes",
] as const;
export type AssessmentField = (typeof ASSESSMENT_FIELDS)[number];

export const ASSESSMENT_FIELD_LABELS: Record<AssessmentField, string> = {
  assessmentDate: "Data da avaliação",
  inspection: "Inspeção e postura",
  palpation: "Palpação",
  functionalGait: "Avaliação funcional e marcha",
  rangeOfMotion: "Amplitude de movimento (ADM)",
  muscleStrength: "Força muscular",
  specialTests: "Testes especiais",
  diagnosis: "Diagnóstico fisioterapêutico",
  therapeuticGoals: "Objetivos terapêuticos",
  clinicalNotes: "Observações clínicas",
};

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} deve ter no máximo ${max} caracteres.` })
    .optional()
    .transform((value) => (value ? value : null));

// Data clínica: não pode ser futura no calendário da clínica (America/Sao_Paulo).
// Lançamento retroativo é permitido.
const assessmentDate = z
  .string({ error: "Informe a data da avaliação." })
  .trim()
  .min(1, { error: "Informe a data da avaliação.", abort: true })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe uma data válida." })
  .transform((value, ctx) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      ctx.addIssue({ code: "custom", message: "Informe uma data válida." });
      return z.NEVER;
    }
    if (value > toLocalDate(new Date())) {
      ctx.addIssue({ code: "custom", message: "A data da avaliação não pode ser futura." });
      return z.NEVER;
    }
    if (date.getUTCFullYear() < 1900) {
      ctx.addIssue({ code: "custom", message: "Informe uma data a partir de 1900." });
      return z.NEVER;
    }
    return date;
  });

const assessmentFields = z.object({
  assessmentDate,
  inspection: optionalText(ASSESSMENT_LIMITS.inspection, "O campo de inspeção e postura"),
  palpation: optionalText(ASSESSMENT_LIMITS.palpation, "O campo de palpação"),
  functionalGait: optionalText(ASSESSMENT_LIMITS.functionalGait, "O campo de avaliação funcional e marcha"),
  rangeOfMotion: optionalText(ASSESSMENT_LIMITS.rangeOfMotion, "O campo de amplitude de movimento"),
  muscleStrength: optionalText(ASSESSMENT_LIMITS.muscleStrength, "O campo de força muscular"),
  specialTests: optionalText(ASSESSMENT_LIMITS.specialTests, "O campo de testes especiais"),
  diagnosis: z
    .string({ error: "Informe o diagnóstico fisioterapêutico." })
    .trim()
    .min(1, { error: "Informe o diagnóstico fisioterapêutico." })
    .max(ASSESSMENT_LIMITS.diagnosis, {
      error: `O diagnóstico deve ter no máximo ${ASSESSMENT_LIMITS.diagnosis} caracteres.`,
    }),
  therapeuticGoals: optionalText(ASSESSMENT_LIMITS.therapeuticGoals, "O campo de objetivos terapêuticos"),
  clinicalNotes: optionalText(ASSESSMENT_LIMITS.clinicalNotes, "As observações"),
});

const id = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, { error: message, abort: true })
    .refine(isPlausibleId, { error: message });

// Criação: exige a anamnese de referência (do mesmo paciente; conferido na transação).
export const createAssessmentSchema = assessmentFields.extend({
  anamnesisId: id("Selecione a anamnese de referência."),
});

// Edição: `version` é a versão que o formulário carregou (checagem otimista).
export const updateAssessmentSchema = assessmentFields.extend({
  version: z.coerce.number({ error: "Dados inválidos." }).int().min(1, { error: "Dados inválidos." }),
});

export type AssessmentInput = z.infer<typeof assessmentFields>;

// Lê o FormData sem confiar em campos extras (autor, paciente e datas técnicas vêm do servidor).
export function assessmentFormEntries(formData: FormData, extra: readonly string[] = []) {
  return Object.fromEntries(
    [...ASSESSMENT_FIELDS, ...extra].map((key) => {
      const value = formData.get(key);
      return [key, typeof value === "string" ? value : undefined];
    }),
  );
}

// Valor comparável e gravável no histórico: datas como AAAA-MM-DD; vazio = null.
export function fieldValueAsText(value: Date | string | null) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

// Campos que mudaram entre o registro atual e a edição validada, na ordem de exibição.
export function diffAssessment(current: AssessmentInput, next: AssessmentInput) {
  return ASSESSMENT_FIELDS.flatMap((field) => {
    const previousValue = fieldValueAsText(current[field]);
    const newValue = fieldValueAsText(next[field]);
    return previousValue === newValue ? [] : [{ field, previousValue, newValue }];
  });
}

// Página da listagem vinda da URL: valores inválidos caem na primeira página.
export const assessmentPageSchema = z.coerce.number().int().min(1).max(10_000).catch(1);
