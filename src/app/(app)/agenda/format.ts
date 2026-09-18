import { CLINIC_TIMEZONE, toInstant } from "@/modules/agenda/validation";

// Exibição sempre no fuso da clínica, independentemente do fuso do servidor.
export function formatDay(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    timeZone: CLINIC_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatTime(date: Date) {
  return date.toLocaleTimeString("pt-BR", { timeZone: CLINIC_TIMEZONE, hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(date: Date) {
  return date.toLocaleString("pt-BR", { timeZone: CLINIC_TIMEZONE, dateStyle: "short", timeStyle: "short" });
}

// Datas civis (YYYY-MM-DD) exibidas no fuso da clínica; meio-dia evita virar o dia.
function civil(date: string) {
  return toInstant(date, "12:00");
}

export function formatDateLabel(date: string) {
  return civil(date).toLocaleDateString("pt-BR", {
    timeZone: CLINIC_TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatWeekdayShort(date: string) {
  return civil(date).toLocaleDateString("pt-BR", { timeZone: CLINIC_TIMEZONE, weekday: "short" });
}

export function formatDayMonth(date: string) {
  return civil(date).toLocaleDateString("pt-BR", { timeZone: CLINIC_TIMEZONE, day: "2-digit", month: "short" });
}

export type AgendaHrefParams = {
  view: string;
  date?: string;
  professionalId?: string;
  from?: string;
  to?: string;
};

export function agendaHref(params: AgendaHrefParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `/agenda?${query}`;
}
