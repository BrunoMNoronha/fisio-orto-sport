import { z } from "zod";

// Cobranças manuais (FIN-01, #86). Valores em BRL são sempre centavos inteiros: o texto digitado é
// convertido por operações de string, sem ponto flutuante em nenhum momento.

export const CHARGE_STATUSES = ["ATIVA", "CANCELADA"] as const;
export type ChargeStatusValue = (typeof CHARGE_STATUSES)[number];

export const CHARGE_STATUS_LABELS: Record<ChargeStatusValue, string> = {
  ATIVA: "Ativa",
  CANCELADA: "Cancelada",
};

export const DESCRIPTION_MAX = 200;
export const REASON_MAX = 500;
// Teto técnico contra erro de digitação (R$ 999.999,99), não regra de negócio. Cabe com folga no
// INTEGER do PostgreSQL.
export const AMOUNT_MAX_CENTS = 99_999_999;
// Faixa técnica do vencimento (data civil), contra anos digitados errado.
export const DUE_DATE_MIN_YEAR = 2000;
export const DUE_DATE_MAX_YEAR = 2100;
export const PAGE_SIZE = 20;

export const AMOUNT_MESSAGES = {
  required: "Informe o valor.",
  format: "Informe um valor válido, como 150,00 ou 1.234,56.",
  precision: "Use no máximo dois dígitos para os centavos.",
  positive: "O valor deve ser maior que zero.",
  max: "O valor deve ser de no máximo R$ 999.999,99.",
} as const;

export type AmountParse = { cents: number } | { error: string };

// "1.234,56", "1234,5", "150" → centavos. Vírgula separa os centavos; ponto só agrupa milhares
// (grupos de três). "150.50" é recusado em vez de adivinhado.
export function parseAmount(raw: string): AmountParse {
  const text = raw.trim().replace(/^R\$\s*/i, "");
  if (!text) return { error: AMOUNT_MESSAGES.required };
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/.exec(text);
  if (!match) return { error: AMOUNT_MESSAGES.format };
  const [, integerPart, fraction = ""] = match;
  if (fraction.length > 2) return { error: AMOUNT_MESSAGES.precision };
  const reais = integerPart.replace(/\./g, "").replace(/^0+(?=\d)/, "");
  // Mais de 7 dígitos de reais já passa do teto; evita números enormes antes da conversão.
  if (reais.length > 7) return { error: AMOUNT_MESSAGES.max };
  const cents = Number(reais) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents <= 0) return { error: AMOUNT_MESSAGES.positive };
  if (cents > AMOUNT_MAX_CENTS) return { error: AMOUNT_MESSAGES.max };
  return { cents };
}

function groupThousands(digits: string) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Centavos → "1.234,56" (campo do formulário). Só aritmética inteira.
export function formatAmountInput(cents: number | bigint) {
  const exactCents = BigInt(cents);
  const absolute = exactCents < BigInt(0) ? -exactCents : exactCents;
  const reais = absolute / BigInt(100);
  const rest = absolute % BigInt(100);
  return `${exactCents < BigInt(0) ? "-" : ""}${groupThousands(String(reais))},${String(rest).padStart(2, "0")}`;
}

// Centavos → "R$ 1.234,56" (exibição).
export function formatBRL(cents: number | bigint) {
  return `R$ ${formatAmountInput(cents)}`;
}

// Data civil guardada como @db.Date (meia-noite UTC): formatar em UTC não desloca o dia.
export function formatCivilDate(date: Date) {
  return date.toISOString().slice(0, 10).split("-").reverse().join("/");
}

export function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Rótulo do paciente na busca e no formulário: inativo continua escolhível, mas sinalizado.
export function patientLabel(patient: { fullName: string; status: "ATIVO" | "INATIVO" }) {
  return patient.status === "INATIVO" ? `${patient.fullName} (inativo)` : patient.fullName;
}

export function isPlausibleId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9]{1,64}$/i.test(id);
}

const id = (message: string) => z.string({ error: message }).trim().refine(isPlausibleId, { error: message });

const description = z
  .string({ error: "Informe a descrição." })
  .trim()
  .min(1, { error: "Informe a descrição." })
  .max(DESCRIPTION_MAX, { error: `A descrição deve ter no máximo ${DESCRIPTION_MAX} caracteres.` });

const amount = z.string({ error: AMOUNT_MESSAGES.required }).transform((value, ctx) => {
  const parsed = parseAmount(value);
  if ("error" in parsed) {
    ctx.addIssue({ code: "custom", message: parsed.error });
    return z.NEVER;
  }
  return parsed.cents;
});

const dueDate = z
  .string({ error: "Informe o vencimento." })
  .trim()
  .min(1, { error: "Informe o vencimento." })
  .transform((value, ctx) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || toDateInput(date) !== value) {
      ctx.addIssue({ code: "custom", message: "Informe um vencimento válido." });
      return z.NEVER;
    }
    const year = date.getUTCFullYear();
    if (year < DUE_DATE_MIN_YEAR || year > DUE_DATE_MAX_YEAR) {
      ctx.addIssue({ code: "custom", message: `Informe um vencimento entre ${DUE_DATE_MIN_YEAR} e ${DUE_DATE_MAX_YEAR}.` });
      return z.NEVER;
    }
    return date;
  });

const reason = z
  .string({ error: "Informe o motivo." })
  .trim()
  .min(1, { error: "Informe o motivo." })
  .max(REASON_MAX, { error: `O motivo deve ter no máximo ${REASON_MAX} caracteres.` });

// Identificador estável da operação, gerado quando o formulário abre.
const requestId = z
  .string({ error: "Dados inválidos. Recarregue a página." })
  .regex(/^[A-Za-z0-9-]{8,64}$/, { error: "Dados inválidos. Recarregue a página." });

export const chargeFields = z.object({
  patientId: id("Selecione o paciente."),
  description,
  amount,
  dueDate,
});

export const createChargeSchema = chargeFields.extend({ requestId });

export const cancelChargeSchema = z.object({
  id: id("Cobrança não encontrada."),
  reason,
});

export const replaceChargeSchema = chargeFields.extend({
  id: id("Cobrança não encontrada."),
  reason,
  requestId,
});

export type ChargeData = { patientId: string; description: string; amountCents: number; dueDate: Date };

export const listChargesSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .catch(undefined)
    .transform((value) => value || undefined),
  status: z.enum(CHARGE_STATUSES).optional().catch(undefined),
  patientId: z
    .string()
    .optional()
    .catch(undefined)
    .transform((value) => (isPlausibleId(value) ? value : undefined)),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export type ListChargesParams = { q?: string; status?: ChargeStatusValue; patientId?: string; page: number };

export const CHARGE_FORM_FIELDS = ["patientId", "description", "amount", "dueDate"] as const;

export function formEntries(formData: FormData, keys: readonly string[]) {
  return Object.fromEntries(
    keys.map((key) => {
      const value = formData.get(key);
      return [key, typeof value === "string" ? value : undefined];
    }),
  );
}
