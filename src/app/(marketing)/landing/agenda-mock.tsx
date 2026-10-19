import {
  CalendarClockIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  LockIcon,
  UserXIcon,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/brand-logo";
import { cn } from "@/lib/utils";
import { CARD } from "./landing-ui";

// Reprodução estática da visão Dia da agenda, com as mesmas cores de situação dos cards reais
// (src/app/(app)/agenda/appointment-status-badge.tsx): agendada fica calma, só exceções ganham cor.
type Tone = "neutral" | "green" | "red-notice" | "blue";

const TONE: Record<Tone, string> = {
  neutral: "border-primary bg-card text-card-foreground",
  green: "border-green-600 bg-green-100 text-green-900 dark:border-green-500 dark:bg-green-950 dark:text-green-200",
  "red-notice":
    "border-red-600 bg-[repeating-linear-gradient(135deg,var(--color-red-50)_0_6px,var(--color-red-100)_6px_12px)] text-red-900 dark:border-red-500 dark:bg-[repeating-linear-gradient(135deg,var(--color-red-950)_0_6px,color-mix(in_oklch,var(--color-red-900)_60%,transparent)_6px_12px)] dark:text-red-200",
  blue: "border-blue-600 bg-blue-100 text-blue-900 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-200",
};

const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00"] as const;

// Linhas de 1 h com 60px (h-15); cada card ocupa 52px a partir de 4px do início do slot.
const APPOINTMENTS: { name: string; time: string; status: string; Icon: LucideIcon; tone: Tone; top: string }[] = [
  { name: "Carla Souza", time: "08:00–09:00", status: "Compareceu", Icon: CircleCheckIcon, tone: "green", top: "top-1" },
  { name: "Marcos Lima", time: "09:00–10:00", status: "Agendada", Icon: CalendarIcon, tone: "neutral", top: "top-16" },
  { name: "João Pedro Alves", time: "10:00–11:00", status: "Faltou (avisou)", Icon: UserXIcon, tone: "red-notice", top: "top-31" },
  { name: "Beatriz Nunes", time: "11:00–12:00", status: "Reagendada", Icon: CalendarClockIcon, tone: "blue", top: "top-46" },
  { name: "Rafael Costa", time: "12:00–13:00", status: "Agendada", Icon: CalendarIcon, tone: "neutral", top: "top-61" },
];

const LEGEND = [
  { label: "Agendada", swatch: "bg-card ring-1 ring-inset ring-primary" },
  { label: "Compareceu", swatch: "bg-green-600 dark:bg-green-500" },
  { label: "Faltou", swatch: "bg-red-600 dark:bg-red-500" },
  { label: "Reagendada", swatch: "bg-blue-600 dark:bg-blue-500" },
  { label: "Cancelada", swatch: "bg-muted-foreground/40" },
] as const;

const CHIP = "flex h-7.5 items-center gap-1.5 rounded-lg border border-input px-2.5 text-xs font-medium";
const NAV_BUTTON = "flex size-6.5 items-center justify-center rounded-lg border border-input text-muted-foreground";

export function AgendaMock() {
  return (
    <div
      role="img"
      aria-label="Tela da agenda na visão Dia, com cards coloridos por situação"
      className={cn(CARD, "flex min-w-0 flex-col gap-3.5 p-4 md:p-5")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <BrandMark className="size-5.5" />
          <span className="text-base font-semibold tracking-tight">Agenda</span>
          <span className="ml-1.5 flex items-center gap-0.5">
            <span className={NAV_BUTTON}>
              <ChevronLeftIcon aria-hidden="true" className="size-3.5" />
            </span>
            <span className="flex h-6.5 items-center rounded-lg border border-input px-2.5 text-xs font-medium">Hoje</span>
            <span className={NAV_BUTTON}>
              <ChevronRightIcon aria-hidden="true" className="size-3.5" />
            </span>
          </span>
          <span className="font-mono text-xs text-muted-foreground">seg., 19 out. 2026</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-[10px] bg-muted p-0.75 text-xs font-medium text-muted-foreground">
            <span className="rounded-lg bg-card px-2.5 py-1.25 text-foreground shadow-xs">Dia</span>
            <span className="px-2.5 py-1.25">Semana</span>
            <span className="px-2.5 py-1.25">Lista</span>
          </div>
          <span className={cn(CHIP, "text-foreground")}>
            <LockIcon aria-hidden="true" className="size-3.25" />
            Bloqueios
          </span>
          <span className="flex h-7.5 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">
            + Novo agendamento
          </span>
        </div>
      </div>

      <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-muted-foreground">
        {LEGEND.map(({ label, swatch }) => (
          <li key={label} className="flex items-center gap-1.25">
            <span aria-hidden="true" className={cn("size-2.5 rounded-sm", swatch)} />
            {label}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-[52px_minmax(0,1fr)] overflow-hidden rounded-lg border bg-card">
        <div className="border-b" />
        <div className="flex min-w-0 items-center gap-2 border-b border-l px-3 py-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
            AP
          </span>
          <span className="grid min-w-0 leading-tight">
            <span className="truncate text-[13px] font-semibold">Ana Paula Ribeiro</span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              2 agendamentos · 1 compareceu · 1 falta · 1 reagendada
            </span>
          </span>
        </div>

        <div>
          {HOURS.map((hour, index) => (
            <div
              key={hour}
              className={cn(
                "h-15 border-t pt-1 pr-2 text-right font-mono text-[11px] text-muted-foreground tabular-nums",
                index === 0 && "border-t-0",
              )}
            >
              {hour}
            </div>
          ))}
        </div>

        <div className="relative isolate border-l">
          {HOURS.map((hour, index) => (
            <div
              key={hour}
              className={cn(
                "relative h-15 border-t after:absolute after:inset-x-0 after:top-1/2 after:border-t after:border-dotted after:border-input",
                index === 0 && "border-t-0",
              )}
            />
          ))}

          {APPOINTMENTS.map(({ name, time, status, Icon, tone, top }) => (
            <div
              key={name}
              className={cn(
                "absolute inset-x-2 flex h-13 flex-col justify-center gap-0.5 rounded-md border-l-4 px-2 text-xs leading-tight shadow-xs",
                TONE[tone],
                top,
              )}
            >
              <b className="flex items-center gap-1.25 font-semibold">
                <Icon aria-hidden="true" className="size-3 shrink-0" />
                <span className="truncate">{name}</span>
              </b>
              <i className="font-mono text-[11px] not-italic opacity-85 tabular-nums">
                {time} · {status}
              </i>
            </div>
          ))}

          <div className="pointer-events-none absolute inset-x-0 top-38 z-10 border-t-2 border-primary">
            <span className="absolute -top-1.5 -left-1.5 size-2.5 rounded-full bg-primary" />
          </div>
          <span className="absolute top-36 -left-[50px] z-10 rounded-sm bg-primary px-1 py-px font-mono text-[10px] text-primary-foreground">
            10:32
          </span>
        </div>
      </div>
    </div>
  );
}
