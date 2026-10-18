import { Calendar, CalendarClock, CircleCheck, CircleX, UserX, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AgendaItem } from "@/modules/agenda/queries";

export type AppointmentStatusFields = Pick<AgendaItem, "status" | "attendance" | "lastRescheduledAt">;

// "muted" é exclusivo de cancelada: no badge compartilha o visual neutro; no card fica apagado.
export type AppointmentTone = "neutral" | "green" | "red" | "blue" | "muted";

export type AppointmentPresentation = { label: string; Icon: LucideIcon; tone: AppointmentTone };

// Fonte única da situação exibida em lista, dia e semana.
// Prioridade: cancelada > presença/falta > reagendada > agendada.
export function appointmentPresentation(item: AppointmentStatusFields): AppointmentPresentation {
  if (item.status === "CANCELADO") return { label: "Cancelada", Icon: CircleX, tone: "muted" };
  if (item.attendance === "COMPARECEU") return { label: "Compareceu", Icon: CircleCheck, tone: "green" };
  if (item.attendance === "FALTA_AVISADA" || item.attendance === "FALTA_NAO_AVISADA") {
    return { label: item.attendance === "FALTA_AVISADA" ? "Faltou (avisou)" : "Faltou (sem aviso)", Icon: UserX, tone: "red" };
  }
  if (item.lastRescheduledAt) return { label: "Reagendada", Icon: CalendarClock, tone: "blue" };
  return { label: "Agendada", Icon: Calendar, tone: "neutral" };
}

const NEUTRAL_BADGE = "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200";

const BADGE_CLASSES: Record<AppointmentTone, string> = {
  neutral: NEUTRAL_BADGE,
  green: "border-green-300 bg-green-100 text-green-900 dark:border-green-600 dark:bg-green-950 dark:text-green-200",
  red: "border-red-300 bg-red-100 text-red-900 dark:border-red-600 dark:bg-red-950 dark:text-red-200",
  blue: "border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-600 dark:bg-blue-950 dark:text-blue-200",
  muted: NEUTRAL_BADGE,
};

// Cards das visões dia e semana: a borda esquerda de 4px é a pista principal, por isso usa tons 600/500.
// "neutral" (agendada) é o estado comum e fica calmo, sem fundo colorido: só as exceções ganham cor,
// e "blue" (reagendada) passa a ser o único azul-claro. "muted" preserva o visual apagado de cancelada.
export const APPOINTMENT_CARD_CLASSES: Record<AppointmentTone, string> = {
  neutral: "border-primary bg-card text-card-foreground hover:bg-muted/60 dark:hover:bg-muted/40",
  green:
    "border-green-600 bg-green-100 text-green-900 hover:bg-green-200/70 dark:border-green-500 dark:bg-green-950 dark:text-green-200 dark:hover:bg-green-900/70",
  red: "border-red-600 bg-red-100 text-red-900 hover:bg-red-200/70 dark:border-red-500 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900/70",
  blue: "border-blue-600 bg-blue-100 text-blue-900 hover:bg-blue-200/70 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900/70",
  muted: "border-muted-foreground/40 bg-muted text-muted-foreground",
};

export function AppointmentStatusBadge({ item }: { item: AppointmentStatusFields }) {
  const { label, Icon, tone } = appointmentPresentation(item);
  return <Badge variant="outline" className={BADGE_CLASSES[tone]}><Icon aria-hidden="true" />{label}</Badge>;
}
