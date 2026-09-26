import { z } from "zod";
import { ASSESSMENT_LIMITS, clinicalDate } from "./assessment-validation";
import { isPlausibleId } from "./validation";

// Reavaliação (Fase 4, #27). Limites iguais aos @db.VarChar do schema; exame físico igual ao da avaliação.
export const REASSESSMENT_LIMITS = {
  inspection: ASSESSMENT_LIMITS.inspection,
  palpation: ASSESSMENT_LIMITS.palpation,
  functionalGait: ASSESSMENT_LIMITS.functionalGait,
  rangeOfMotion: ASSESSMENT_LIMITS.rangeOfMotion,
  muscleStrength: ASSESSMENT_LIMITS.muscleStrength,
  specialTests: ASSESSMENT_LIMITS.specialTests,
  painLimitations: 4000,
  progressSummary: 4000,
  goalsJustification: 2000,
  conclusionSummary: 2000,
  reason: 500,
} as const;

export const REASSESSMENT_PAGE_SIZE = 10;

export const GOALS_STATUSES = ["ATINGIDOS", "PARCIALMENTE_ATINGIDOS", "NAO_ATINGIDOS"] as const;
export type GoalsStatusValue = (typeof GOALS_STATUSES)[number];
export const GOALS_STATUS_LABELS: Record<GoalsStatusValue, string> = {
  ATINGIDOS: "Atingidos",
  PARCIALMENTE_ATINGIDOS: "Parcialmente atingidos",
  NAO_ATINGIDOS: "Não atingidos",
};

// A conclusão só documenta: "Indicação de alta" não encerra plano, não inativa paciente nem mexe na agenda.
export const CONCLUSIONS = ["CONTINUIDADE", "AJUSTE_PLANO", "INDICACAO_ALTA"] as const;
export type ConclusionValue = (typeof CONCLUSIONS)[number];
export const CONCLUSION_LABELS: Record<ConclusionValue, string> = {
  CONTINUIDADE: "Continuidade do plano",
  AJUSTE_PLANO: "Ajuste do plano",
  INDICACAO_ALTA: "Indicação de alta",
};

export const EXAM_FIELDS = [
  "inspection",
  "palpation",
  "functionalGait",
  "rangeOfMotion",
  "muscleStrength",
  "specialTests",
] as const;
export type ExamField = (typeof EXAM_FIELDS)[number];

// Campos editáveis, na ordem de exibição (plano, revisão, avaliação e referências são fixados na criação).
export const REASSESSMENT_FIELDS = [
  "reassessmentDate",
  ...EXAM_FIELDS,
  "painLimitations",
  "progressSummary",
  "goalsStatus",
  "goalsJustification",
  "conclusion",
  "conclusionSummary",
] as const;
export type ReassessmentField = (typeof REASSESSMENT_FIELDS)[number];
export type ReassessmentTextField = Exclude<ReassessmentField, "reassessmentDate" | "goalsStatus" | "conclusion">;

export const REASSESSMENT_FIELD_LABELS: Record<ReassessmentField, string> = {
  reassessmentDate: "Data da reavaliação",
  inspection: "Inspeção e postura",
  palpation: "Palpação",
  functionalGait: "Avaliação funcional e marcha",
  rangeOfMotion: "Amplitude de movimento (ADM)",
  muscleStrength: "Força muscular",
  specialTests: "Testes especiais",
  painLimitations: "Dor e limitações atuais",
  progressSummary: "Evolução em relação à referência",
  goalsStatus: "Situação dos objetivos do plano",
  goalsJustification: "Justificativa da situação dos objetivos",
  conclusion: "Conclusão",
  conclusionSummary: "Síntese da conclusão",
};

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} deve ter no máximo ${max} caracteres.` })
    .optional()
    .transform((value) => (value ? value : null));

const requiredText = (max: number, empty: string, label: string) =>
  z
    .string({ error: empty })
    .trim()
    .min(1, { error: empty })
    .max(max, { error: `${label} deve ter no máximo ${max} caracteres.` });

const reassessmentFields = z.object({
  reassessmentDate: clinicalDate("da reavaliação"),
  inspection: optionalText(REASSESSMENT_LIMITS.inspection, "O campo de inspeção e postura"),
  palpation: optionalText(REASSESSMENT_LIMITS.palpation, "O campo de palpação"),
  functionalGait: optionalText(REASSESSMENT_LIMITS.functionalGait, "O campo de avaliação funcional e marcha"),
  rangeOfMotion: optionalText(REASSESSMENT_LIMITS.rangeOfMotion, "O campo de amplitude de movimento"),
  muscleStrength: optionalText(REASSESSMENT_LIMITS.muscleStrength, "O campo de força muscular"),
  specialTests: optionalText(REASSESSMENT_LIMITS.specialTests, "O campo de testes especiais"),
  painLimitations: optionalText(REASSESSMENT_LIMITS.painLimitations, "O campo de dor e limitações"),
  progressSummary: requiredText(
    REASSESSMENT_LIMITS.progressSummary,
    "Descreva a evolução em relação à referência.",
    "A evolução",
  ),
  goalsStatus: z.enum(GOALS_STATUSES, { error: "Selecione a situação dos objetivos." }),
  goalsJustification: requiredText(
    REASSESSMENT_LIMITS.goalsJustification,
    "Justifique a situação dos objetivos.",
    "A justificativa",
  ),
  conclusion: z.enum(CONCLUSIONS, { error: "Selecione a conclusão." }),
  conclusionSummary: requiredText(REASSESSMENT_LIMITS.conclusionSummary, "Informe a síntese da conclusão.", "A síntese"),
});

export type ReassessmentContent = z.infer<typeof reassessmentFields>;

export const createReassessmentSchema = reassessmentFields.extend({
  planId: z
    .string({ error: "Selecione o plano terapêutico." })
    .trim()
    .min(1, { error: "Selecione o plano terapêutico.", abort: true })
    .refine(isPlausibleId, { error: "Selecione o plano terapêutico." }),
});

export const updateReassessmentSchema = reassessmentFields.extend({
  version: z.coerce.number({ error: "Dados inválidos." }).int().min(1, { error: "Dados inválidos." }),
  reason: requiredText(REASSESSMENT_LIMITS.reason, "Informe o motivo da correção.", "O motivo"),
});

// Lê o FormData sem confiar em campos extras (autor, paciente, referências e datas técnicas vêm do servidor).
export function reassessmentFormEntries(formData: FormData, extra: readonly string[] = []) {
  return Object.fromEntries(
    [...REASSESSMENT_FIELDS, ...extra].map((key) => {
      const value = formData.get(key);
      return [key, typeof value === "string" ? value : undefined];
    }),
  );
}

// Valor comparável e gravável no histórico: datas como AAAA-MM-DD; vazio = null.
export function reassessmentValueAsText(value: Date | string | null) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

export function diffReassessment(current: ReassessmentContent, next: ReassessmentContent) {
  return REASSESSMENT_FIELDS.flatMap((field) => {
    const previousValue = reassessmentValueAsText(current[field]);
    const newValue = reassessmentValueAsText(next[field]);
    return previousValue === newValue ? [] : [{ field, previousValue, newValue }];
  });
}

// Conteúdo congelado na criação para a comparação (avaliação de origem e reavaliação anterior do plano).
export type ReferenceSnapshot = {
  assessment: {
    id: string;
    version: number;
    assessmentDate: string;
    diagnosis: string;
  } & Record<ExamField, string | null>;
  previous:
    | ({
        id: string;
        reassessmentDate: string;
        painLimitations: string | null;
        progressSummary: string;
        goalsStatus: GoalsStatusValue;
        conclusion: ConclusionValue;
      } & Record<ExamField, string | null>)
    | null;
};

export const reassessmentPageSchema = z.coerce.number().int().min(1).max(10_000).catch(1);
