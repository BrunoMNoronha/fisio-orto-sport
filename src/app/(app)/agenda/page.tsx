import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { listAgenda, listProfessionals, type AgendaItem } from "@/modules/agenda/queries";
import { APPOINTMENT_STATUS_LABELS, parseAgendaFilter, toLocalDate } from "@/modules/agenda/validation";
import { firstParam } from "@/modules/pacientes/validation";
import { formatDay, formatTime } from "./format";

export const metadata: Metadata = { title: "Agenda — TechLab+ Fisio OrtoSport" };

function groupByDay(items: AgendaItem[]) {
  const groups = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const key = toLocalDate(item.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const actor = await requirePermission("agenda:ler");
  const canManage = can(actor.role, "agenda:gerir");

  const raw = await searchParams;
  const filter = parseAgendaFilter({
    professionalId: firstParam(raw.professionalId),
    from: firstParam(raw.from),
    to: firstParam(raw.to),
  });
  const [items, professionals] = await Promise.all([listAgenda(filter), listProfessionals()]);
  const groups = groupByDay(items);

  const newQuery = new URLSearchParams({ date: filter.from });
  if (filter.professionalId) newQuery.set("professionalId", filter.professionalId);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">Agendamentos por profissional e período.</p>
        </div>
        {canManage && (
          <Link href={`/agenda/novo?${newQuery}`} className={buttonVariants()}>
            Novo agendamento
          </Link>
        )}
      </div>

      <form role="search" method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-2">
          <Label htmlFor="agenda-profissional">Profissional</Label>
          <NativeSelect
            id="agenda-profissional"
            name="professionalId"
            defaultValue={filter.professionalId ?? ""}
            className="w-full"
          >
            <NativeSelectOption value="">Todos</NativeSelectOption>
            {professionals.map((professional) => (
              <NativeSelectOption key={professional.id} value={professional.id}>
                {professional.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="agenda-de">De</Label>
          <Input id="agenda-de" name="from" type="date" defaultValue={filter.from} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="agenda-ate">Até</Label>
          <Input id="agenda-ate" name="to" type="date" defaultValue={filter.to} />
        </div>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {groups.length === 0 ? (
        <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum agendamento no período.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([day, dayItems]) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium capitalize">{formatDay(dayItems[0].startsAt)}</h2>
              <ul className="divide-y rounded-lg border">
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
      )}
    </main>
  );
}
