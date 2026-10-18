import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, initials } from "@/lib/utils";
import type { AgendaItem, ScheduleBlockItem } from "@/modules/agenda/queries";
import { addDays, toInstant, toLocalDate } from "@/modules/agenda/validation";
import { APPOINTMENT_CARD_CLASSES, appointmentPresentation } from "./appointment-status-badge";
import {
  HOUR_HEIGHT_PX,
  assignLanes,
  blockMinutesOnDay,
  dayHourRange,
  groupByProfessional,
  placeOnGrid,
} from "./day-layout";
import { formatDateTime, formatTime } from "./format";

type Props = {
  date: string;
  items: AgendaItem[];
  // Bloqueios ativos (MEL-02) que tocam o dia.
  blocks?: ScheduleBlockItem[];
  professionals: { id: string; name: string }[];
  canManage: boolean;
  // Faixa visual configurada; sem ela, o padrão 07:00–20:00.
  range?: { startHour: number; endHour: number };
  now?: Date;
};

const pad = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const formatCount = (count: number) => `${count} ${count === 1 ? "agendamento" : "agendamentos"}`;
// Altura mínima visual de um card (px): um atendimento de 15 min teria 16px, pequeno demais para o toque.
// O card pode invadir até 10px do slot seguinte; em foco/hover ele sobe acima dos vizinhos.
const MIN_CARD_HEIGHT_PX = 26;

// Grade do dia: uma coluna por profissional, horários em linhas de 1 h.
export function AgendaDayGrid({ date, items, blocks = [], professionals, canManage, range, now = new Date() }: Props) {
  const columns = groupByProfessional(items, professionals);
  const { startHour, endHour } = dayHourRange(items, range);
  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
  const height = hours.length * HOUR_HEIGHT_PX;
  const nowTop = toLocalDate(now) === date ? placeOnGrid({ startsAt: now, endsAt: now }, startHour).top : -1;
  const showNow = nowTop >= 0 && nowTop <= height;
  const dayStart = toInstant(date, "00:00");
  const dayEnd = toInstant(addDays(date, 1), "00:00");
  const pxPerMinute = HOUR_HEIGHT_PX / 60;

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
        style={{ gridTemplateColumns: `3.5rem ${columns.map(column => `minmax(${Math.max(11, assignLanes(column.items).lanes * 9)}rem, 1fr)`).join(" ")}` }}
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
                {formatCount(own.filter((item) => item.status === "AGENDADO").length)}
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
          const { placed } = assignLanes(own);
          const newQuery = (hour: number) =>
            new URLSearchParams({ date, professionalId: professional.id, start: pad(hour) });
          return (
            // Container query: a densidade dos cards segue a largura da coluna, não do viewport.
            <div key={professional.id} className="relative border-l @container/col" style={{ height }}>
              {hours.map((hour) =>
                canManage ? (
                  <Link
                    key={hour}
                    href={`/agenda/novo?${newQuery(hour)}`}
                    className="block border-t border-border/60 transition-colors first:border-t-0 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                    style={{ height: HOUR_HEIGHT_PX }}
                  >
                    {/* Texto real (não só aria-label): o link vazio não tem nome em todas as tecnologias assistivas. */}
                    <span className="sr-only">
                      Agendar às {pad(hour)} com {professional.name}
                    </span>
                  </Link>
                ) : (
                  <div
                    key={hour}
                    className="border-t border-border/60 first:border-t-0"
                    style={{ height: HOUR_HEIGHT_PX }}
                  />
                ),
              )}

              {blocks
                .filter((block) => block.professional.id === professional.id)
                .map((block) => {
                  const minutes = blockMinutesOnDay(block, dayStart, dayEnd);
                  if (!minutes) return null;
                  const start = Math.max(minutes.start, startHour * 60);
                  const end = Math.min(minutes.end, endHour * 60);
                  if (end <= start) return null;
                  const label = `Bloqueado de ${formatDateTime(block.startsAt)} a ${formatDateTime(block.endsAt)}${block.reason ? `: ${block.reason}` : ""}`;
                  return (
                    <Link
                      key={block.id}
                      href={`/agenda/bloqueios?${new URLSearchParams({ professionalId: professional.id })}`}
                      aria-label={`${label}, ${professional.name}`}
                      title={label}
                      className="absolute inset-x-0 z-[1] overflow-hidden border-y border-dashed border-muted-foreground/40 bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,transparent_6px_12px)] px-2 py-1 text-xs text-muted-foreground"
                      style={{ top: (start - startHour * 60) * pxPerMinute, height: (end - start) * pxPerMinute }}
                    >
                      <span className="rounded bg-card/90 px-1 font-medium">
                        Bloqueado{block.reason ? ` · ${block.reason}` : ""}
                      </span>
                    </Link>
                  );
                })}

              {placed.map(({ item, lane, lanes }) => {
                const { top, height: boxHeight } = placeOnGrid(item, startHour);
                const { label, Icon, tone } = appointmentPresentation(item);
                const cancelled = item.status === "CANCELADO";
                // Card baixo: uma linha com ícone, nome e hora; a situação fica no aria-label e no title.
                const compact = boxHeight < 40;
                const time = `${formatTime(item.startsAt)}–${formatTime(item.endsAt)}`;
                return (
                  <Link
                    key={item.id}
                    href={`/agenda/${item.id}`}
                    aria-label={`${time}, ${item.patient.fullName}, ${label}`}
                    title={`${item.patient.fullName} · ${time} · ${label}`}
                    className={cn(
                      "absolute z-[2] flex overflow-hidden rounded-md border-l-4 px-2 text-xs shadow-xs transition-colors hover:z-[3] focus-visible:z-[3] @[22rem]/col:text-sm",
                      APPOINTMENT_CARD_CLASSES[tone],
                      compact ? "flex-row items-center gap-2 py-0 leading-tight" : "flex-col py-1",
                    )}
                    style={{
                      top: top + 1,
                      height: Math.max(boxHeight - 2, MIN_CARD_HEIGHT_PX),
                      left: `calc(${(lane * 100) / lanes}% + 4px)`,
                      width: `calc(${100 / lanes}% - 8px)`,
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <Icon aria-hidden="true" className="size-3 shrink-0 @[22rem]/col:size-3.5" />
                      <span className={cn("truncate font-medium", cancelled && "line-through")}>
                        {item.patient.fullName}
                      </span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1 tabular-nums opacity-80">
                      <span className="shrink-0">{time}</span>
                      {!compact && <span className="truncate">· {label}</span>}
                    </span>
                  </Link>
                );
              })}

              {showNow && (
                <div
                  aria-hidden
                  // Cor primária, não destrutiva: o vermelho já significa "faltou" nos cards.
                  className="pointer-events-none absolute inset-x-0 z-[3] border-t-2 border-primary"
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
