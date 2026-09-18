import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { listPatientAppointments, type AgendaItem } from "@/modules/agenda/queries";
import { APPOINTMENT_STATUS_LABELS } from "@/modules/agenda/validation";
import { requirePermission } from "@/modules/auth/dal";
import { getPatient } from "@/modules/pacientes/queries";
import { formatDay, formatTime } from "../../../agenda/format";

export const metadata: Metadata = { title: "Agendamentos do paciente — TechLab+ Fisio OrtoSport" };

// Histórico administrativo exibido na ficha; o limite evita páginas enormes.
const PAST_LIMIT = 50;

function AppointmentsTable({ items, empty }: { items: AgendaItem[]; empty: string }) {
  if (items.length === 0) {
    return <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground shadow-xs">{empty}</p>;
  }
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Horário</TableHead>
            <TableHead>Profissional</TableHead>
            <TableHead>Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const cancelled = item.status === "CANCELADO";
            return (
              <TableRow key={item.id} className={cn(cancelled && "text-muted-foreground")}>
                <TableCell className="first-letter:uppercase">
                  <Link href={`/agenda/${item.id}`} className="font-medium underline-offset-4 hover:underline">
                    {formatDay(item.startsAt)}
                  </Link>
                </TableCell>
                <TableCell className={cn("tabular-nums", cancelled && "line-through")}>
                  {formatTime(item.startsAt)}–{formatTime(item.endsAt)}
                </TableCell>
                <TableCell>{item.professional.name}</TableCell>
                <TableCell>
                  <Badge variant={cancelled ? "outline" : "secondary"}>{APPOINTMENT_STATUS_LABELS[item.status]}</Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function AgendamentosPacientePage({ params }: PageProps<"/pacientes/[id]/agendamentos">) {
  await requirePermission("agenda:ler");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const now = new Date();
  const [upcoming, past] = await Promise.all([
    listPatientAppointments(patient.id, { upcoming: true, now }),
    listPatientAppointments(patient.id, { upcoming: false, take: PAST_LIMIT, now }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="agendamentos-proximos" className="flex flex-col gap-3">
        <h2 id="agendamentos-proximos" className="text-base font-medium">
          Próximos
        </h2>
        <AppointmentsTable items={upcoming} empty="Nenhum agendamento futuro." />
      </section>
      <section aria-labelledby="agendamentos-anteriores" className="flex flex-col gap-3">
        <h2 id="agendamentos-anteriores" className="text-base font-medium">
          Anteriores
        </h2>
        <AppointmentsTable items={past} empty="Nenhum agendamento anterior." />
        {past.length === PAST_LIMIT && (
          <p className="text-xs text-muted-foreground">Exibindo os {PAST_LIMIT} mais recentes.</p>
        )}
      </section>
    </div>
  );
}
