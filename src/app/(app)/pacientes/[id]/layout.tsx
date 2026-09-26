import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlusIcon, PencilIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { initials } from "@/lib/utils";
import { requirePermission } from "@/modules/auth/dal";
import { CLINIC_TIMEZONE } from "@/modules/agenda/validation";
import { can } from "@/modules/auth/permissions";
import { getPatient } from "@/modules/pacientes/queries";
import { PATIENT_STATUS_LABELS, formatPhone } from "@/modules/pacientes/validation";
import { formatAge } from "../format";
import { ToggleStatusButton } from "../toggle-status-button";
import { PatientTabs } from "./patient-tabs";

// Ficha do paciente: cabeçalho-resumo e abas compartilhados por todas as páginas do paciente.
// Só dados cadastrais aqui; o conteúdo clínico fica nas páginas protegidas por `clinico:ler`.
export default async function PacienteLayout({ children, params }: LayoutProps<"/pacientes/[id]">) {
  const actor = await requirePermission("pacientes:ler");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const active = patient.status === "ATIVO";
  const canManage = can(actor.role, "pacientes:gerir");
  const canSchedule = can(actor.role, "agenda:gerir") && active;
  const tabs = [
    { href: `/pacientes/${patient.id}`, label: "Resumo", exact: true },
    ...(can(actor.role, "clinico:ler")
      ? [
          { href: `/pacientes/${patient.id}/anamnese`, label: "Anamnese" },
          { href: `/pacientes/${patient.id}/avaliacoes`, label: "Avaliações" },
        ]
      : []),
    ...(can(actor.role, "agenda:ler")
      ? [{ href: `/pacientes/${patient.id}/agendamentos`, label: "Agendamentos" }]
      : []),
    { href: `/pacientes/${patient.id}/documentos`, label: "Documentos" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4 shadow-xs md:p-5">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-12">
            <AvatarFallback className="bg-accent text-base font-semibold text-accent-foreground">
              {initials(patient.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">{patient.fullName}</h1>
              <Badge variant={active ? "secondary" : "outline"}>{PATIENT_STATUS_LABELS[patient.status]}</Badge>
            </div>
            <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
              <span>{formatAge(patient.birthDate)}</span>
              <span aria-hidden>·</span>
              <span>{formatPhone(patient.phone)}</span>
              <span aria-hidden>·</span>
              <span>Desde {patient.createdAt.toLocaleDateString("pt-BR", { timeZone: CLINIC_TIMEZONE })}</span>
            </p>
          </div>
        </div>
        {(canManage || canSchedule) && (
          <div className="flex flex-wrap items-start gap-2">
            {canSchedule && (
              <Link href={`/agenda/novo?patientId=${patient.id}`} className={buttonVariants()}>
                <CalendarPlusIcon />
                Agendar
              </Link>
            )}
            {canManage && (
              <>
                <Link href={`/pacientes/${patient.id}/editar`} className={buttonVariants({ variant: "outline" })}>
                  <PencilIcon />
                  Editar
                </Link>
                <ToggleStatusButton id={patient.id} status={patient.status} patientName={patient.fullName} />
              </>
            )}
          </div>
        )}
      </header>

      <PatientTabs tabs={tabs} />

      {children}
    </div>
  );
}
