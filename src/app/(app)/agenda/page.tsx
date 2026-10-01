import { groupByProfessional } from "./day-layout";
import { peakOccupancy } from "@/modules/agenda/capacity";
import type { Metadata } from "next";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { listAgenda, listProfessionals, listScheduleBlocks } from "@/modules/agenda/queries";
import { parseAgendaView } from "@/modules/agenda/validation";
import { getAgendaPreferences } from "@/modules/configuracoes/queries";
import { firstParam } from "@/modules/pacientes/validation";
import { AgendaDayGrid } from "./agenda-day-grid";
import { AgendaListView } from "./agenda-list-view";
import { AgendaToolbar } from "./agenda-toolbar";
import { AgendaWeekView } from "./agenda-week-view";

export const metadata: Metadata = { title: "Agenda — TechLab+ Fisio OrtoSport" };

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const actor = await requirePermission("agenda:ler");
  const canManage = can(actor.role, "agenda:gerir");

  const raw = await searchParams;
  // Configuração lida por requisição: a visão inicial (#69) vale sem deploy.
  const preferences = await getAgendaPreferences();
  const { view, date, today, filter } = parseAgendaView(
    {
      view: firstParam(raw.view),
      date: firstParam(raw.date),
      professionalId: firstParam(raw.professionalId),
      from: firstParam(raw.from),
      to: firstParam(raw.to),
    },
    new Date(),
    preferences.defaultView,
  );
  const [items, blocks, professionals] = await Promise.all([
    listAgenda(filter),
    view === "lista" ? Promise.resolve([]) : listScheduleBlocks(filter),
    listProfessionals(),
  ]);
  const columns = filter.professionalId
    ? professionals.filter((professional) => professional.id === filter.professionalId)
    : professionals;

  const exceeded = groupByProfessional(items, columns).filter(column =>
    peakOccupancy(column.items.filter(item => item.status === "AGENDADO")) > preferences.maxSimultaneousAppointments
  ).map(column => column.professional);

  return (
    <div className="flex flex-col gap-6">
      <AgendaToolbar
        view={view}
        date={date}
        today={today}
        filter={filter}
        professionals={professionals}
        canManage={canManage}
      />
      {exceeded.length > 0 && (
        <p role="status" className="rounded-md border border-destructive p-3 text-sm">
          Limite atual: {preferences.maxSimultaneousAppointments} agendamentos simultâneos por fisioterapeuta.
          Há horários acima do limite para {exceeded.map(person => person.name).join(", ")} neste período.
          Os agendamentos foram preservados; consulte-os para reagendar ou cancelar quando permitido.
        </p>
      )}
      {view === "dia" && (
        <AgendaDayGrid
          date={date}
          items={items}
          blocks={blocks}
          professionals={columns}
          canManage={canManage}
          range={{ startHour: preferences.dayStartHour, endHour: preferences.dayEndHour }}
        />
      )}
      {view === "semana" && (
        <AgendaWeekView
          from={filter.from}
          today={today}
          items={items}
          blocks={blocks}
          professionalId={filter.professionalId} />
      )}
      {view === "lista" && <AgendaListView items={items} businessHours={preferences.businessHours} />}
    </div>
  );
}
