import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, initials } from "@/lib/utils";
import type { AgendaItem } from "@/modules/agenda/queries";
import { APPOINTMENT_STATUS_LABELS, toLocalDate } from "@/modules/agenda/validation";
import { HOUR_HEIGHT_PX, assignLanes, dayHourRange, groupByProfessional, placeOnGrid } from "./day-layout";
import { formatTime } from "./format";

type Props = {
  date: string;
  items: AgendaItem[];
  professionals: { id: string; name: string }[];
  canManage: boolean;
  now?: Date;
};

const pad = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

// Grade do dia: uma coluna por profissional, horários em linhas de 1 h.
export function AgendaDayGrid({ date, items, professionals, canManage, now = new Date() }: Props) {
  const columns = groupByProfessional(items, professionals);
  const { startHour, endHour } = dayHourRange(items);
  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
  const height = hours.length * HOUR_HEIGHT_PX;
  const nowTop = toLocalDate(now) === date ? placeOnGrid({ startsAt: now, endsAt: now }, startHour).top : -1;
  const showNow = nowTop >= 0 && nowTop <= height;

  if (columns.length === 0) {
    return (
      <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-xs">
        Nenhum profissional ativo para exibir.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
      <div
        className="grid min-w-fit"
        style={{ gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(11rem, 1fr))` }}
      >
        <div className="sticky left-0 z-[4] border-b bg-card" />
        {columns.map(({ professional, items: own }) => (
          <div key={professional.id} className="flex items-center gap-2 border-b border-l px-3 py-2.5">
            <Avatar>
              <AvatarFallback className="bg-accent text-xs text-accent-foreground">
                {initials(professional.name)}
              </AvatarFallback>
            </Avatar>
            <div className="grid text-sm leading-tight">
              <span className="truncate font-medium">{professional.name}</span>
              <span className="text-xs text-muted-foreground">
                {own.filter((item) => item.status === "AGENDADO").length} agendado(s)
              </span>
            </div>
          </div>
        ))}

        <div className="sticky left-0 z-[4] bg-card" style={{ height }}>
          {hours.map((hour) => (
            <div
              key={hour}
              className="border-t px-2 pt-1 text-xs tabular-nums text-muted-foreground first:border-t-0"
              style={{ height: HOUR_HEIGHT_PX }}
            >
              {pad(hour)}
            </div>
          ))}
        </div>

        {columns.map(({ professional, items: own }) => {
          const { lanes, placed } = assignLanes(own);
          const newQuery = (hour: number) =>
            new URLSearchParams({ date, professionalId: professional.id, start: pad(hour) });
          return (
            <div key={professional.id} className="relative border-l" style={{ height }}>
              {hours.map((hour) =>
                canManage ? (
                  <Link
                    key={hour}
                    href={`/agenda/novo?${newQuery(hour)}`}
                    aria-label={`Agendar às ${pad(hour)} com ${professional.name}`}
                    className="block border-t border-border/60 transition-colors first:border-t-0 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                    style={{ height: HOUR_HEIGHT_PX }}
                  />
                ) : (
                  <div
                    key={hour}
                    className="border-t border-border/60 first:border-t-0"
                    style={{ height: HOUR_HEIGHT_PX }}
                  />
                ),
              )}

              {placed.map(({ item, lane }) => {
                const { top, height: boxHeight } = placeOnGrid(item, startHour);
                const cancelled = item.status === "CANCELADO";
                const time = `${formatTime(item.startsAt)}–${formatTime(item.endsAt)}`;
                return (
                  <Link
                    key={item.id}
                    href={`/agenda/${item.id}`}
                    aria-label={`${time}, ${item.patient.fullName}, ${APPOINTMENT_STATUS_LABELS[item.status]}`}
                    className={cn(
                      "absolute z-[2] flex flex-col overflow-hidden rounded-md border-l-4 px-2 py-1 text-xs shadow-xs transition-colors",
                      cancelled
                        ? "border-muted-foreground/40 bg-muted text-muted-foreground"
                        : "border-primary bg-accent text-accent-foreground hover:bg-accent/70",
                      boxHeight < 40 && "flex-row items-center gap-2",
                    )}
                    style={{
                      top: top + 1,
                      height: boxHeight - 2,
                      left: `calc(${(lane * 100) / lanes}% + 4px)`,
                      width: `calc(${100 / lanes}% - 8px)`,
                    }}
                  >
                    <span className={cn("truncate font-medium", cancelled && "line-through")}>
                      {item.patient.fullName}
                    </span>
                    <span className="shrink-0 tabular-nums opacity-80">{time}</span>
                  </Link>
                );
              })}

              {showNow && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-[3] border-t-2 border-destructive"
                  style={{ top: nowTop }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
