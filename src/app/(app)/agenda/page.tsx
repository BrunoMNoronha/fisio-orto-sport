import type { Metadata } from "next";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { listAgenda, listProfessionals } from "@/modules/agenda/queries";
import { parseAgendaView } from "@/modules/agenda/validation";
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
  const { view, date, today, filter } = parseAgendaView({
    view: firstParam(raw.view),
    date: firstParam(raw.date),
    professionalId: firstParam(raw.professionalId),
    from: firstParam(raw.from),
    to: firstParam(raw.to),
  });
  const [items, professionals] = await Promise.all([listAgenda(filter), listProfessionals()]);
  const columns = filter.professionalId
    ? professionals.filter((professional) => professional.id === filter.professionalId)
    : professionals;

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
      {view === "dia" && <AgendaDayGrid date={date} items={items} professionals={columns} canManage={canManage} />}
      {view === "semana" && (
        <AgendaWeekView from={filter.from} today={today} items={items} professionalId={filter.professionalId} />
      )}
      {view === "lista" && <AgendaListView items={items} />}
    </div>
  );
}
