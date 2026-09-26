import { z } from "zod";
import { clinicalDate } from "./assessment-validation";
import { isPlausibleId } from "./validation";

// Plano terapêutico (Fase 4). Os limites espelham os @db.VarChar do schema Prisma.
export const PLAN_LIMITS = {
  goals: 2000,
  conduct: 4000,
  techniques: 4000,
  exercises: 4000,
  frequency: 200,
  reassessment: 500,
  notes: 4000,
  reason: 500,
} as const;

// Quantidade prevista: informativa (não é saldo, pacote nem autorização de convênio).
export const PLANNED_SESSIONS_MAX = 100;
export const PLAN_PAGE_SIZE = 10;

export const PLAN_STATUSES = ["ATIVO", "ENCERRADO"] as const;
export type PlanStatusValue = (typeof PLAN_STATUSES)[number];
export const PLAN_STATUS_LABELS: Record<PlanStatusValue, string> = { ATIVO: "Ativo", ENCERRADO: "Encerrado" };

// INICIAL só na revisão 1; as seguintes distinguem correção de erro documental de mudança clínica.
export const REVISION_KINDS = ["CORRECAO", "MUDANCA_CLINICA"] as const;
export type RevisionKindValue = (typeof REVISION_KINDS)[number] | "INICIAL";
export const REVISION_KIND_LABELS: Record<RevisionKindValue, string> = {
  INICIAL: "Versão inicial",
  CORRECAO: "Correção de erro de registro",
  MUDANCA_CLINICA: "Mudança clínica do planejamento",
};

// Conteúdo de cada revisão, na ordem de exibição.
export const PLAN_FIELDS = [
  "planDate",
  "goals",
  "conduct",
  "techniques",
  "exercises",
  "plannedSessions",
  "frequency",
  "reassessment",
  "notes",
] as const;
export type PlanField = (typeof PLAN_FIELDS)[number];

export const PLAN_FIELD_LABELS: Record<PlanField, string> = {
  planDate: "Data do plano",
  goals: "Objetivos terapêuticos",
  conduct: "Conduta",
  techniques: "Técnicas previstas",
  exercises: "Exercícios previstos",
  plannedSessions: "Quantidade prevista de sessões",
  frequency: "Frequência prevista",
  reassessment: "Critério ou previsão de reavaliação",
  notes: "Observações",
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

// Inteiro de 1 a 100 quando informado; vazio = não informado.
const plannedSessions = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    if (!/^\d{1,3}$/.test(value) || Number(value) < 1 || Number(value) > PLANNED_SESSIONS_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `A quantidade prevista de sessões deve ser um número inteiro de 1 a ${PLANNED_SESSIONS_MAX}.`,
      });
      return z.NEVER;
    }
    return Number(value);
  });

const planFields = z.object({
  planDate: clinicalDate("do plano"),
  goals: requiredText(PLAN_LIMITS.goals, "Informe os objetivos terapêuticos.", "Os objetivos"),
  conduct: requiredText(PLAN_LIMITS.conduct, "Informe a conduta.", "A conduta"),
  techniques: optionalText(PLAN_LIMITS.techniques, "O campo de técnicas"),
  exercises: optionalText(PLAN_LIMITS.exercises, "O campo de exercícios"),
  plannedSessions,
  frequency: optionalText(PLAN_LIMITS.frequency, "A frequência"),
  reassessment: optionalText(PLAN_LIMITS.reassessment, "O critério de reavaliação"),
  notes: optionalText(PLAN_LIMITS.notes, "As observações"),
});

export type PlanContent = z.infer<typeof planFields>;

const id = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, { error: message, abort: true })
    .refine(isPlausibleId, { error: message });

const reason = requiredText(PLAN_LIMITS.reason, "Informe o motivo.", "O motivo");

// Criação: a avaliação de origem é obrigatória (do mesmo paciente; conferido na transação).
export const createPlanSchema = planFields.extend({
  assessmentId: id("Selecione a avaliação de origem."),
});

// Nova revisão: tipo, motivo e a revisão vigente que o formulário carregou (checagem otimista).
export const revisePlanSchema = planFields.extend({
  kind: z.enum(REVISION_KINDS, { error: "Selecione o tipo de revisão." }),
  reason,
  baseRevision: z.coerce.number({ error: "Dados inválidos." }).int().min(1, { error: "Dados inválidos." }),
  // Reavaliação que motivou a revisão (#27), quando a revisão parte de uma conclusão "Ajuste do plano".
  reassessmentId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null)
    .refine((value) => value === null || isPlausibleId(value), { error: "Dados inválidos." }),
});

export const changePlanStatusSchema = z.object({
  toStatus: z.enum(PLAN_STATUSES, { error: "Dados inválidos." }),
  reason,
});

// Lê o FormData sem confiar em campos extras (autor, paciente, plano e datas técnicas vêm do servidor).
export function planFormEntries(formData: FormData, extra: readonly string[] = []) {
  return Object.fromEntries(
    [...PLAN_FIELDS, ...extra].map((key) => {
      const value = formData.get(key);
      return [key, typeof value === "string" ? value : undefined];
    }),
  );
}

// Nova revisão idêntica à vigente não é gravada (não há o que corrigir ou mudar).
export function samePlanContent(a: PlanContent, b: PlanContent) {
  return PLAN_FIELDS.every((field) => {
    const left = a[field];
    const right = b[field];
    if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
    return left === right;
  });
}

export const planPageSchema = z.coerce.number().int().min(1).max(10_000).catch(1);
export const revisionNumberSchema = z.coerce.number().int().min(1).max(10_000);
