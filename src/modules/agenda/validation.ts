import { z } from "zod";

export const APPOINTMENT_STATUSES = ["AGENDADO", "CANCELADO"] as const;
export type AppointmentStatusValue = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatusValue, string> = {
  AGENDADO: "Agendado",
  CANCELADO: "Cancelado",
};

// Datas e horas digitadas no formulário são horário local da clínica; no banco ficam em timestamptz.
export const CLINIC_TIMEZONE = "America/Sao_Paulo";
// Limite técnico de sanidade (evita erro de digitação), não regra de negócio de duração.
export const MAX_DURATION_MINUTES = 12 * 60;
export const MAX_RANGE_DAYS = 31;
export const DEFAULT_RANGE_DAYS = 7;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CLINIC_TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zonedParts(instant: Date) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

// Diferença (ms) entre o relógio da clínica e o UTC no instante dado.
function offsetAt(ms: number) {
  const p = zonedParts(new Date(ms));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

export function isValidDate(value: string) {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// "2026-09-21" + "10:00" no fuso da clínica → instante UTC.
export function toInstant(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let result = wall - offsetAt(wall);
  result = wall - offsetAt(result);
  return new Date(result);
}

// Data civil (YYYY-MM-DD) do instante no fuso da clínica.
export function toLocalDate(instant: Date) {
  const p = zonedParts(instant);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function toLocalTime(instant: Date) {
  const p = zonedParts(instant);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// Intervalos semiabertos [início, fim): encostar não é sobrepor.
export function overlaps(a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

const requiredId = (message: string) => z.string({ error: message }).trim().min(1, { error: message }).max(64);
const id = requiredId("Registro inválido.");
const date = z
  .string({ error: "Informe a data." })
  .trim()
  .refine(isValidDate, { error: "Informe uma data válida." });
const time = z
  .string({ error: "Informe o horário." })
  .trim()
  .regex(TIME_RE, { error: "Informe um horário válido (HH:MM)." });
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Máximo de ${max} caracteres.` })
    .optional()
    .transform((value) => (value ? value : null));

const slotFields = {
  professionalId: requiredId("Selecione o profissional."),
  date,
  startTime: time,
  endTime: time,
};

type Slot = { date: string; startTime: string; endTime: string };

function checkSlot(value: Slot, ctx: z.RefinementCtx) {
  const startsAt = toInstant(value.date, value.startTime);
  const endsAt = toInstant(value.date, value.endTime);
  if (endsAt <= startsAt) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "O horário final deve ser posterior ao inicial." });
  } else if (endsAt.getTime() - startsAt.getTime() > MAX_DURATION_MINUTES * 60 * 1000) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "O agendamento pode ter no máximo 12 horas." });
  }
}

function toRange<T extends Slot>({ date: day, startTime, endTime, ...rest }: T) {
  return { ...rest, startsAt: toInstant(day, startTime), endsAt: toInstant(day, endTime) };
}

export const appointmentSchema = z
  .object({ patientId: requiredId("Selecione o paciente."), ...slotFields, notes: optionalText(500) })
  .superRefine(checkSlot)
  .transform(toRange);

export const rescheduleSchema = z
  .object({ id, ...slotFields })
  .superRefine(checkSlot)
  .transform(toRange);

export const cancelSchema = z.object({ id, reason: optionalText(500) });

export type AgendaFilter = { professionalId?: string; from: string; to: string };

// Filtros da URL. Valores inválidos caem no padrão (semana a partir de hoje) em vez de quebrar a página.
export function parseAgendaFilter(
  raw: { professionalId?: string; from?: string; to?: string },
  now = new Date(),
): AgendaFilter {
  const today = toLocalDate(now);
  const from = raw.from && isValidDate(raw.from) ? raw.from : today;
  let to = raw.to && isValidDate(raw.to) ? raw.to : addDays(from, DEFAULT_RANGE_DAYS - 1);
  if (daysBetween(from, to) < 0) to = from;
  if (daysBetween(from, to) >= MAX_RANGE_DAYS) to = addDays(from, MAX_RANGE_DAYS - 1);
  const professionalId = raw.professionalId?.trim();
  return {
    ...(professionalId && professionalId.length <= 64 ? { professionalId } : {}),
    from,
    to,
  };
}

// Limites do período em instantes: do início de `from` ao início do dia seguinte a `to` (horário da clínica).
export function filterBounds({ from, to }: AgendaFilter) {
  return { gte: toInstant(from, "00:00"), lt: toInstant(addDays(to, 1), "00:00") };
}
