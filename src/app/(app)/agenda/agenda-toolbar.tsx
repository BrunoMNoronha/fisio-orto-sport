import { ActionLink } from "@/components/action-link";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { addDays, type AgendaFilter, type AgendaView } from "@/modules/agenda/validation";
import { AutoSubmitSelect } from "./auto-submit-select";
import { agendaHref, formatDateLabel, formatDayMonth } from "./format";

const VIEW_LABELS: Record<AgendaView, string> = { dia: "Dia", semana: "Semana", lista: "Lista" };

type Props = {
  view: AgendaView;
  date: string;
  today: string;
  filter: AgendaFilter;
  professionals: { id: string; name: string }[];
  canManage: boolean;
};

export function AgendaToolbar({ view, date, today, filter, professionals, canManage }: Props) {
  const professionalId = filter.professionalId;
  const step = view === "semana" ? 7 : 1;
  const periodLabel =
    view === "semana" ? `${formatDayMonth(filter.from)} – ${formatDayMonth(filter.to)}` : formatDateLabel(date);

  const newQuery = new URLSearchParams({ date: view === "lista" ? filter.from : date });
  if (professionalId) newQuery.set("professionalId", professionalId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-2xl font-semibold tracking-tight">Agenda</h1>

        {view !== "lista" && (
          <div className="flex items-center gap-1">
            <ActionLink help="Exibe o período anterior da agenda, mantendo o profissional selecionado."
              href={agendaHref({ view, date: addDays(date, -step), professionalId })}
              aria-label={view === "semana" ? "Semana anterior" : "Dia anterior"}
              className={buttonVariants({ variant: "outline", size: "icon" })}
            >
              <ChevronLeftIcon />
            </ActionLink>
            <ActionLink help="Exibe a agenda na data de hoje."
              href={agendaHref({ view, date: today, professionalId })}
              aria-current={date === today ? "date" : undefined}
              className={buttonVariants({ variant: "outline" })}
            >
              Hoje
            </ActionLink>
            <ActionLink help="Exibe o próximo período da agenda, mantendo o profissional selecionado."
              href={agendaHref({ view, date: addDays(date, step), professionalId })}
              aria-label={view === "semana" ? "Próxima semana" : "Próximo dia"}
              className={buttonVariants({ variant: "outline", size: "icon" })}
            >
              <ChevronRightIcon />
            </ActionLink>
            <span className="ml-2 inline-block text-sm font-medium first-letter:uppercase">{periodLabel}</span>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <nav aria-label="Visão da agenda" className="flex gap-1 rounded-lg bg-muted p-1">
            {(Object.keys(VIEW_LABELS) as AgendaView[]).map((key) => (
              <ActionLink help="Muda a forma de visualizar a agenda, preservando a data e o profissional."
                key={key}
                href={agendaHref({ view: key, date, professionalId })}
                aria-current={key === view ? "page" : undefined}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  key === view && "bg-background text-foreground shadow-xs hover:bg-background",
                )}
              >
                {VIEW_LABELS[key]}
              </ActionLink>
            ))}
          </nav>
          <ActionLink help="Abre a consulta de indisponibilidades dos profissionais."
            href={`/agenda/bloqueios${professionalId ? `?${new URLSearchParams({ professionalId })}` : ""}`}
            className={buttonVariants({ variant: "outline" })}
          >
            Bloqueios
          </ActionLink>
          {canManage && (
            <ActionLink help="Abre o formulário para criar um agendamento; a marcação só ocorre ao confirmar." href={`/agenda/novo?${newQuery}`} className={buttonVariants()}>
              <PlusIcon />
              Novo agendamento
            </ActionLink>
          )}
        </div>
      </div>

      <form role="search" method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value={view} />
        {view !== "lista" && <input type="hidden" name="date" value={date} />}
        <div className="flex min-w-56 flex-col gap-2">
          <Label help="Profissional ao qual os horários ou bloqueios se referem." htmlFor="agenda-profissional">Profissional</Label>
          <AutoSubmitSelect
            id="agenda-profissional"
            name="professionalId"
            defaultValue={professionalId ?? ""}
            className="w-full"
          >
            <NativeSelectOption value="">Todos</NativeSelectOption>
            {professionals.map((professional) => (
              <NativeSelectOption key={professional.id} value={professional.id}>
                {professional.name}
              </NativeSelectOption>
            ))}
          </AutoSubmitSelect>
        </div>
        {view === "lista" && (
          <>
            <div className="flex flex-col gap-2">
              <Label help="Primeira data incluída na consulta do período." htmlFor="agenda-de">De</Label>
              <Input id="agenda-de" name="from" type="date" defaultValue={filter.from} />
            </div>
            <div className="flex flex-col gap-2">
              <Label help="Última data incluída na consulta do período." htmlFor="agenda-ate">Até</Label>
              <Input id="agenda-ate" name="to" type="date" defaultValue={filter.to} />
            </div>
          </>
        )}
        <Button help="Atualiza a consulta usando os filtros informados, sem alterar os registros." type="submit" variant="secondary">
          Filtrar
        </Button>
        <ul aria-label="Legenda" className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-primary" />
            Agendado
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-muted-foreground/40" />
            Cancelado
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm border border-dashed border-muted-foreground/60" />
            Bloqueado
          </li>
        </ul>
      </form>
    </div>
  );
}
