import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AgendaItem } from "@/modules/agenda/queries";
import { addDays, toLocalDate } from "@/modules/agenda/validation";
import { agendaHref, formatDayMonth, formatTime, formatWeekdayShort } from "./format";

type Props = { from: string; today: string; items: AgendaItem[]; professionalId?: string };

// Semana de segunda a domingo; cada dia leva à visão diária.
export function AgendaWeekView({ from, today, items, professionalId }: Props) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(from, index));
  const byDay = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const key = toLocalDate(item.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }

  return (
    <div className="grid gap-3 md:grid-cols-7">
      {days.map((day) => {
        const dayItems = byDay.get(day) ?? [];
        const isToday = day === today;
        return (
          <section
            key={day}
            aria-label={`${formatWeekdayShort(day)} ${formatDayMonth(day)}`}
            className={cn("flex min-h-40 flex-col rounded-xl border bg-card shadow-xs", isToday && "border-primary")}
          >
            <Link
              href={agendaHref({ view: "dia", date: day, professionalId })}
              className="flex items-baseline justify-between gap-2 border-b px-3 py-2 hover:bg-muted/60"
            >
              <span className="text-xs font-medium uppercase text-muted-foreground">{formatWeekdayShort(day)}</span>
              <span className={cn("text-sm font-semibold", isToday && "text-primary")}>{formatDayMonth(day)}</span>
            </Link>
            {dayItems.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">Livre</p>
            ) : (
              <ul className="flex flex-col gap-1.5 p-2">
                {dayItems.map((item) => {
                  const cancelled = item.status === "CANCELADO";
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/agenda/${item.id}`}
                        className={cn(
                          "flex flex-col rounded-md border-l-4 px-2 py-1 text-xs transition-colors",
                          cancelled
                            ? "border-muted-foreground/40 bg-muted text-muted-foreground"
                            : "border-primary bg-accent text-accent-foreground hover:bg-accent/70",
                        )}
                      >
                        <span className="tabular-nums">{formatTime(item.startsAt)}</span>
                        <span className={cn("truncate font-medium", cancelled && "line-through")}>
                          {item.patient.fullName}
                        </span>
                        {!professionalId && <span className="truncate opacity-80">{item.professional.name}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
