import { CLINIC_TIMEZONE } from "@/modules/agenda/validation";

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
