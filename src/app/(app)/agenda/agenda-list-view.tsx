import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { AgendaItem } from "@/modules/agenda/queries";
import { APPOINTMENT_STATUS_LABELS, toLocalDate } from "@/modules/agenda/validation";
import { formatDay, formatTime } from "./format";

function groupByDay(items: AgendaItem[]) {
  const groups = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const key = toLocalDate(item.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}

export function AgendaListView({ items }: { items: AgendaItem[] }) {
  const groups = groupByDay(items);

  if (groups.length === 0) {
    return (
      <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-xs">
        Nenhum agendamento no período.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map(([day, dayItems]) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium capitalize">{formatDay(dayItems[0].startsAt)}</h2>
          <ul className="divide-y rounded-xl border bg-card shadow-xs">
            {dayItems.map((item) => {
              const cancelled = item.status === "CANCELADO";
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <span className={cancelled ? "tabular-nums text-muted-foreground line-through" : "tabular-nums"}>
                    {formatTime(item.startsAt)}–{formatTime(item.endsAt)}
                  </span>
                  <Link href={`/agenda/${item.id}`} className="flex-1 font-medium underline-offset-4 hover:underline">
                    {item.patient.fullName}
                  </Link>
                  <span className="text-muted-foreground">{item.professional.name}</span>
                  {cancelled && <Badge variant="outline">{APPOINTMENT_STATUS_LABELS[item.status]}</Badge>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
