import Link from "next/link";
import { ArrowRightIcon, CalendarCheckIcon, CalendarRangeIcon, UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { listAgenda } from "@/modules/agenda/queries";
import { parseAgendaFilter, toLocalDate } from "@/modules/agenda/validation";
import { listPatients } from "@/modules/pacientes/queries";
import { listPatientsSchema } from "@/modules/pacientes/validation";
import { formatTime } from "./agenda/format";

const modulos = ["Avaliações", "Planos terapêuticos", "Sessões e evolução clínica"];

export default async function Home() {
  const user = await requireUser();
  const canPatients = can(user.role, "pacientes:ler");
  const canAgenda = can(user.role, "agenda:ler");

  const week = parseAgendaFilter({});
  const [patients, agenda] = await Promise.all([
    canPatients ? listPatients(listPatientsSchema.parse({ status: "ATIVO" })) : null,
    canAgenda ? listAgenda(week) : null,
  ]);
  const scheduled = agenda?.filter((item) => item.status !== "CANCELADO") ?? [];
  const today = scheduled.filter((item) => toLocalDate(item.startsAt) === week.from);

  const stats = [
    canPatients && {
      label: "Pacientes ativos",
      value: patients?.total ?? 0,
      icon: UsersIcon,
      href: "/pacientes",
    },
    canAgenda && {
      label: "Agendamentos hoje",
      value: today.length,
      icon: CalendarCheckIcon,
      href: "/agenda",
    },
    canAgenda && {
      label: "Próximos 7 dias",
      value: scheduled.length,
      icon: CalendarRangeIcon,
      href: "/agenda",
    },
  ].filter(Boolean) as { label: string; value: number; icon: typeof UsersIcon; href: string }[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Olá, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">
          Gestão clínica organizada. Atendimento com continuidade. Evolução acompanhada.
        </p>
      </div>

      {stats.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.label} className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-3xl font-semibold tabular-nums">{stat.value}</CardTitle>
                <CardAction>
                  <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <stat.icon className="size-5" />
                  </div>
                </CardAction>
              </CardHeader>
              <CardContent>
                <Link
                  href={stat.href}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  Ver detalhes <ArrowRightIcon className="size-3.5" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {canAgenda && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Agenda de hoje</CardTitle>
              <CardDescription>Atendimentos confirmados para hoje.</CardDescription>
              <CardAction>
                <Link href="/agenda" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Abrir agenda
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              {today.length === 0 ? (
                <p className="rounded-xl bg-muted/60 px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhum atendimento hoje.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {today.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/agenda/${item.id}`}
                        className="flex items-center gap-4 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-muted"
                      >
                        <span className="rounded-lg bg-accent px-2 py-1 font-medium tabular-nums text-accent-foreground">
                          {formatTime(item.startsAt)}
                        </span>
                        <span className="flex-1 font-medium">{item.patient.fullName}</span>
                        <span className="hidden text-muted-foreground sm:inline">
                          {item.professional.name}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
        <Card className={canAgenda ? undefined : "lg:col-span-3"}>
          <CardHeader>
            <CardTitle>Em construção</CardTitle>
            <CardDescription>Próximos módulos do sistema.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {modulos.map((modulo) => (
                <li
                  key={modulo}
                  className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5 text-sm"
                >
                  {modulo}
                  <Badge variant="outline">Em breve</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
