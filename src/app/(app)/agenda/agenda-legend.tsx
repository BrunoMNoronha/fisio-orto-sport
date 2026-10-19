import { Calendar, CalendarClock, ChevronDownIcon, CircleCheck, CircleX, UserX, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Mesmas cores e ícones dos cards (appointment-status-badge.tsx); bloqueio não é agendamento.
// O quadradinho de "Agendada" é vazado como o card: o estado comum não tem fundo colorido.
export const LEGEND: { label: string; Icon?: LucideIcon; swatch: string }[] = [
  { label: "Agendada", Icon: Calendar, swatch: "bg-card ring-1 ring-inset ring-primary" },
  { label: "Compareceu", Icon: CircleCheck, swatch: "bg-green-600 dark:bg-green-500" },
  { label: "Faltou", Icon: UserX, swatch: "bg-red-600 dark:bg-red-500" },
  {
    label: "Faltou, avisou",
    Icon: UserX,
    swatch: "bg-[repeating-linear-gradient(135deg,var(--color-red-200)_0_2px,var(--color-red-600)_2px_4px)]",
  },
  { label: "Reagendada", Icon: CalendarClock, swatch: "bg-blue-600 dark:bg-blue-500" },
  { label: "Cancelada", Icon: CircleX, swatch: "bg-muted-foreground/40" },
  { label: "Bloqueado", swatch: "border border-dashed border-muted-foreground/60" },
];

function LegendList({ className }: { className?: string }) {
  return (
    <ul aria-label="Legenda" className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {LEGEND.map(({ label, Icon, swatch }) => (
        <li key={label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-sm", swatch)} />
          {Icon && <Icon aria-hidden="true" className="size-3" />}
          {label}
        </li>
      ))}
    </ul>
  );
}

// Em telas estreitas a legenda é referência, não ação: fica recolhida num <details> nativo (sem JS)
// para a grade começar acima da dobra. A partir de `md` ela aparece inteira, como antes.
export function AgendaLegend() {
  return (
    <>
      <LegendList className="ml-auto hidden md:flex" />
      <details className="group basis-full md:hidden">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 py-1 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
          Legenda
          <ChevronDownIcon aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <LegendList className="pt-1" />
      </details>
    </>
  );
}
