import { z } from "zod";

// Anamnese subjetiva (Fase 2b). Os limites espelham os @db.VarChar do schema Prisma.
export const LIMITS = {
  chiefComplaint: 500,
  currentIllnessHistory: 4000,
  personalPathologicalHistory: 4000,
  surgeries: 2000,
  currentMedications: 2000,
  habitsPhysicalActivity: 2000,
  painLocation: 200,
  functionalLimitations: 2000,
  patientGoals: 2000,
  clinicalNotes: 4000,
} as const;

export const PAIN_TYPES = ["PONTADA", "QUEIMACAO", "PESO", "IRRADIADA"] as const;
export type PainTypeValue = (typeof PAIN_TYPES)[number];

export const PAIN_TYPE_LABELS: Record<PainTypeValue, string> = {
  PONTADA: "Pontada",
  QUEIMACAO: "Queimação",
  PESO: "Peso",
  IRRADIADA: "Irradiada",
};

// Campos de texto enviados pelo formulário (painTypes é lido à parte, com getAll).
export const ANAMNESIS_TEXT_FIELDS = [
  "assessmentDate",
  "chiefComplaint",
  "currentIllnessHistory",
  "personalPathologicalHistory",
  "surgeries",
  "currentMedications",
  "habitsPhysicalActivity",
  "painIntensity",
  "painLocation",
  "functionalLimitations",
  "patientGoals",
  "clinicalNotes",
] as const;

// Data civil "hoje" (UTC), como em pacientes. UTC está à frente do horário de Brasília,
// então uma avaliação de hoje nunca é recusada como futura.
function todayUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} deve ter no máximo ${max} caracteres.` })
    .optional()
    .transform((value) => (value ? value : null));

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
    if (date.getTime() > todayUtc(new Date()).getTime()) {
      ctx.addIssue({ code: "custom", message: "A data da avaliação não pode ser futura." });
      return z.NEVER;
    }
    if (date.getUTCFullYear() < 1900) {
      ctx.addIssue({ code: "custom", message: "Informe uma data a partir de 1900." });
      return z.NEVER;
    }
    return date;
  });

// EVA: inteiro de 0 a 10; vazio = não informado.
const painIntensity = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    if (!/^\d{1,2}$/.test(value) || Number(value) > 10) {
      ctx.addIssue({ code: "custom", message: "A intensidade da dor (EVA) deve ser um número inteiro de 0 a 10." });
      return z.NEVER;
    }
    return Number(value);
  });

const painTypes = z
  .array(z.enum(PAIN_TYPES, { error: "Tipo de dor inválido." }))
  .max(PAIN_TYPES.length, { error: "Tipo de dor inválido." })
  .refine((values) => new Set(values).size === values.length, { error: "Tipo de dor repetido." });

export const anamnesisSchema = z.object({
  assessmentDate,
  chiefComplaint: z
    .string({ error: "Informe a queixa principal." })
    .trim()
    .min(1, { error: "Informe a queixa principal." })
    .max(LIMITS.chiefComplaint, {
      error: `A queixa principal deve ter no máximo ${LIMITS.chiefComplaint} caracteres.`,
    }),
  currentIllnessHistory: optionalText(LIMITS.currentIllnessHistory, "A história da doença atual"),
  personalPathologicalHistory: optionalText(LIMITS.personalPathologicalHistory, "O histórico clínico"),
  surgeries: optionalText(LIMITS.surgeries, "O histórico cirúrgico"),
  currentMedications: optionalText(LIMITS.currentMedications, "O campo de medicamentos"),
  habitsPhysicalActivity: optionalText(LIMITS.habitsPhysicalActivity, "O campo de hábitos e atividade física"),
  painIntensity,
  painLocation: optionalText(LIMITS.painLocation, "A localização da dor"),
  painTypes,
  functionalLimitations: optionalText(LIMITS.functionalLimitations, "O campo de limitações funcionais"),
  patientGoals: optionalText(LIMITS.patientGoals, "O campo de objetivos do paciente"),
  clinicalNotes: optionalText(LIMITS.clinicalNotes, "As observações"),
});

export type AnamnesisInput = z.infer<typeof anamnesisSchema>;

// Lê o FormData sem confiar em campos extras (autor, paciente e datas técnicas vêm do servidor).
export function anamnesisFormEntries(formData: FormData) {
  const values: Record<string, unknown> = Object.fromEntries(
    ANAMNESIS_TEXT_FIELDS.map((key) => {
      const value = formData.get(key);
      return [key, typeof value === "string" ? value : undefined];
    }),
  );
  values.painTypes = formData.getAll("painTypes").filter((value) => typeof value === "string");
  return values;
}

// Identificadores vindos da URL: formato cuid, sem consultar o banco quando claramente inválidos.
export function isPlausibleId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9]{1,64}$/i.test(id);
}
