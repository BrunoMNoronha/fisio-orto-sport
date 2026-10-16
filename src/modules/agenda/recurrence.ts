import { z } from "zod";
import { addDays, isValidDate } from "./validation";

// Teto técnico do lote, compartilhado entre interface e servidor.
export const MAX_RECURRING_SESSIONS = 100;
export const DEFAULT_MAX_RECURRING_SESSIONS = 10;
export const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

export function weekday(date: string) {
  return ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

export const recurrenceSchema = z.object({
  date: z.string().refine(isValidDate, "Informe uma data válida."),
  sessionCount: z.coerce.number().int("Informe uma quantidade inteira.").min(1, "Informe ao menos uma sessão.")
    .max(MAX_RECURRING_SESSIONS, `Máximo de ${MAX_RECURRING_SESSIONS} sessões por lote.`),
  weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Selecione ao menos um dia.").max(7)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
}).superRefine((value, ctx) => {
  if (isValidDate(value.date) && !value.weekdays.includes(weekday(value.date))) {
    ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Inclua o dia da data inicial entre os dias selecionados." });
  }
  if (isValidDate(value.date) && value.date > "9998-01-01") {
    ctx.addIssue({ code: "custom", path: ["date"], message: "A data inicial deve ser anterior a 9998 para comportar a recorrência." });
  }
});

export type Recurrence = z.output<typeof recurrenceSchema>;

export const recurringRequestSchema = z.object({
  requestKey: z.uuid({ error: "Tentativa inválida. Atualize o formulário." }).transform((key) => key.toLowerCase()),
});

// Valida também chamadas diretas: não aceitar quantidade infinita nem seleção vazia.
export function recurrenceDates(input: z.input<typeof recurrenceSchema>): string[] {
  const { date, sessionCount, weekdays } = recurrenceSchema.parse(input);
  const dates: string[] = [];
  for (let day = date; dates.length < sessionCount; day = addDays(day, 1)) {
    if (weekdays.includes(weekday(day))) dates.push(day);
  }
  return dates;
}

export function displayDate(date: string) {
  return date.split("-").reverse().join("/");
}
