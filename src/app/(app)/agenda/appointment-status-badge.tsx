import { Calendar, CalendarClock, CircleCheck, CircleX, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AgendaItem } from "@/modules/agenda/queries";

type StatusFields = Pick<AgendaItem, "status" | "attendance" | "lastRescheduledAt">;

const styles = {
  neutral: "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200",
  green: "border-green-300 bg-green-100 text-green-900 dark:border-green-600 dark:bg-green-950 dark:text-green-200",
  red: "border-red-300 bg-red-100 text-red-900 dark:border-red-600 dark:bg-red-950 dark:text-red-200",
  blue: "border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-600 dark:bg-blue-950 dark:text-blue-200",
};

function presentation(item: StatusFields) {
  if (item.status === "CANCELADO") return { label: "Cancelada", Icon: CircleX, color: styles.neutral };
  if (item.attendance === "COMPARECEU") return { label: "Compareceu", Icon: CircleCheck, color: styles.green };
  if (item.attendance === "FALTA_AVISADA" || item.attendance === "FALTA_NAO_AVISADA") {
    return { label: item.attendance === "FALTA_AVISADA" ? "Faltou (avisou)" : "Faltou (sem aviso)", Icon: UserX, color: styles.red };
  }
  if (item.lastRescheduledAt) return { label: "Reagendada", Icon: CalendarClock, color: styles.blue };
  return { label: "Agendada", Icon: Calendar, color: styles.neutral };
}

export function AppointmentStatusBadge({ item }: { item: StatusFields }) {
  const { label, Icon, color } = presentation(item);
  return <Badge variant="outline" className={color}><Icon aria-hidden="true" />{label}</Badge>;
}
