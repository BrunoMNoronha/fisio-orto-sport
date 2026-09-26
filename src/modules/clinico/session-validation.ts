import { z } from "zod";
import { isValidDate, isValidTime, toInstant, toLocalDate, toLocalTime } from "@/modules/agenda/validation";
import { isPlausibleId } from "./validation";

// Atendimento clínico (sessão de fisioterapia) com evolução. Limites iguais aos @db.VarChar do schema.
export const SESSION_LIMITS = {
  techniques: 4000,
  exercises: 4000,
  observations: 4000,
  evolution: 4000,
  nextSteps: 2000,
  reason: 500,
} as const;

export const SESSION_PAGE_SIZE = 10;

export const SESSION_STATUSES = ["VALIDO", "INVALIDADO"] as const;
export type SessionStatusValue = (typeof SESSION_STATUSES)[number];
export const SESSION_STATUS_LABELS: Record<SessionStatusValue, string> = { VALIDO: "Válido", INVALIDADO: "Invalidado" };

// Campos editáveis (plano e revisão aplicada são fixados na criação), na ordem de exibição.
// "occurredAt" e "professional" aparecem no histórico com valores legíveis (data/hora local e nome).
export const SESSION_TEXT_FIELDS = ["techniques", "exercises", "observations", "evolution", "nextSteps"] as const;
export type SessionTextField = (typeof SESSION_TEXT_FIELDS)[number];
export const SESSION_HISTORY_FIELDS = ["occurredAt", "professional", ...SESSION_TEXT_FIELDS] as const;
export type SessionHistoryField = (typeof SESSION_HISTORY_FIELDS)[number];

export const SESSION_FIELD_LABELS: Record<SessionHistoryField, string> = {
  occurredAt: "Data e hora do atendimento",
  professional: "Profissional responsável",
  techniques: "Técnicas realizadas",
  exercises: "Exercícios realizados",
  observations: "Observações",
  evolution: "Evolução clínica",
  nextSteps: "Próximos passos",
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

const id = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, { error: message, abort: true })
    .refine(isPlausibleId, { error: message });

// Data e hora digitadas no fuso da clínica (America/Sao_Paulo) viram um instante. Atendimento
// futuro é recusado; lançamento retroativo é permitido.
const sessionFields = z
  .object({
    occurredDate: z.string({ error: "Informe a data do atendimento." }).trim(),
    occurredTime: z.string({ error: "Informe a hora do atendimento." }).trim(),
    professionalId: id("Selecione o profissional responsável."),
    techniques: optionalText(SESSION_LIMITS.techniques, "O campo de técnicas"),
    exercises: optionalText(SESSION_LIMITS.exercises, "O campo de exercícios"),
    observations: optionalText(SESSION_LIMITS.observations, "O campo de observações"),
    evolution: requiredText(SESSION_LIMITS.evolution, "Informe a evolução clínica.", "A evolução"),
    nextSteps: optionalText(SESSION_LIMITS.nextSteps, "O campo de próximos passos"),
  })
  .transform(({ occurredDate, occurredTime, ...rest }, ctx) => {
    let valid = true;
    if (!occurredDate) {
      ctx.addIssue({ code: "custom", path: ["occurredDate"], message: "Informe a data do atendimento." });
      valid = false;
    } else if (!isValidDate(occurredDate) || Number(occurredDate.slice(0, 4)) < 1900) {
      ctx.addIssue({ code: "custom", path: ["occurredDate"], message: "Informe uma data válida." });
      valid = false;
    }
    if (!occurredTime) {
      ctx.addIssue({ code: "custom", path: ["occurredTime"], message: "Informe a hora do atendimento." });
      valid = false;
    } else if (!isValidTime(occurredTime)) {
      ctx.addIssue({ code: "custom", path: ["occurredTime"], message: "Informe uma hora válida (HH:MM)." });
      valid = false;
    }
    if (!valid) return z.NEVER;
    const occurredAt = toInstant(occurredDate, occurredTime);
    if (occurredAt.getTime() > Date.now()) {
      ctx.addIssue({ code: "custom", path: ["occurredDate"], message: "O atendimento não pode estar no futuro." });
      return z.NEVER;
    }
    return { ...rest, occurredAt };
  });

export type SessionContent = z.infer<typeof sessionFields>;

const reason = requiredText(SESSION_LIMITS.reason, "Informe o motivo.", "O motivo");

// Criação: plano, revisão aplicada e a chave de idempotência gerada pelo formulário.
export const createSessionSchema = z
  .object({
    planId: id("Selecione o plano terapêutico."),
    planRevisionId: id("Selecione a revisão do plano aplicada."),
    requestId: z
      .string({ error: "Dados inválidos. Recarregue a página." })
      .regex(/^[A-Za-z0-9-]{8,64}$/, { error: "Dados inválidos. Recarregue a página." }),
  })
  .and(sessionFields);

// Edição: versão carregada (checagem otimista) e motivo da correção.
export const updateSessionSchema = z
  .object({
    version: z.coerce.number({ error: "Dados inválidos." }).int().min(1, { error: "Dados inválidos." }),
    reason,
  })
  .and(sessionFields);

export const invalidateSessionSchema = z.object({ reason });

export const SESSION_FORM_FIELDS = [
  "occurredDate",
  "occurredTime",
  "professionalId",
  ...SESSION_TEXT_FIELDS,
] as const;

// Lê o FormData sem confiar em campos extras (autor, paciente e datas técnicas vêm do servidor).
export function sessionFormEntries(formData: FormData, extra: readonly string[] = []) {
  return Object.fromEntries(
    [...SESSION_FORM_FIELDS, ...extra].map((key) => {
      const value = formData.get(key);
      return [key, typeof value === "string" ? value : undefined];
    }),
  );
}

// Momento clínico legível no fuso da clínica (ex.: "26/09/2026 14:30").
export function formatOccurredAt(instant: Date) {
  const [y, m, d] = toLocalDate(instant).split("-");
  return `${d}/${m}/${y} ${toLocalTime(instant)}`;
}

export const sessionPageSchema = z.coerce.number().int().min(1).max(10_000).catch(1);
