import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { getPatient } from "@/modules/pacientes/queries";
import { PATIENT_STATUS_LABELS, formatCpf, formatPhone } from "@/modules/pacientes/validation";
import { formatAge, formatDate } from "../format";
import { ToggleStatusButton } from "../toggle-status-button";

export const metadata: Metadata = { title: "Paciente — TechLab+ Fisio OrtoSport" };

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{value || "—"}</dd>
    </div>
  );
}

export default async function PacientePage({ params }: PageProps<"/pacientes/[id]">) {
  const actor = await requirePermission("pacientes:ler");
  const canManage = can(actor.role, "pacientes:gerir");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const hasGuardian = Boolean(patient.guardianName || patient.guardianPhone);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10">
      <div className="flex flex-col gap-3">
        <Link href="/pacientes" className="text-sm text-muted-foreground hover:text-foreground">
          ← Pacientes
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{patient.fullName}</h1>
            <Badge variant={patient.status === "ATIVO" ? "secondary" : "outline"}>
              {PATIENT_STATUS_LABELS[patient.status]}
            </Badge>
          </div>
          {canManage && (
            <div className="flex items-start gap-3">
              <Link href={`/pacientes/${patient.id}/editar`} className={buttonVariants({ variant: "outline" })}>
                Editar
              </Link>
              <ToggleStatusButton id={patient.id} status={patient.status} />
            </div>
          )}
        </div>
      </div>

      <section aria-labelledby="dados-pessoais" className="flex flex-col gap-4">
        <h2 id="dados-pessoais" className="text-base font-medium">Dados pessoais</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Item label="Data de nascimento" value={`${formatDate(patient.birthDate)} (${formatAge(patient.birthDate)})`} />
          <Item label="CPF" value={patient.cpf ? formatCpf(patient.cpf) : null} />
        </dl>
      </section>

      <section aria-labelledby="contato" className="flex flex-col gap-4">
        <h2 id="contato" className="text-base font-medium">Contato</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Item label="Telefone" value={formatPhone(patient.phone)} />
          <Item label="E-mail" value={patient.email} />
          <div className="sm:col-span-2">
            <Item label="Endereço" value={patient.address} />
          </div>
        </dl>
      </section>

      {hasGuardian && (
        <section aria-labelledby="responsavel" className="flex flex-col gap-4">
          <h2 id="responsavel" className="text-base font-medium">Responsável legal</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Item label="Nome" value={patient.guardianName} />
            <Item label="Telefone" value={patient.guardianPhone ? formatPhone(patient.guardianPhone) : null} />
            <Item label="Parentesco ou relação" value={patient.guardianRelationship} />
          </dl>
        </section>
      )}

      <section aria-labelledby="observacoes" className="flex flex-col gap-4">
        <h2 id="observacoes" className="text-base font-medium">Observações administrativas</h2>
        <dl>
          <Item label="Observações" value={patient.notes} />
        </dl>
      </section>

      <p className="text-xs text-muted-foreground">
        Cadastrado em {patient.createdAt.toLocaleString("pt-BR")} · atualizado em{" "}
        {patient.updatedAt.toLocaleString("pt-BR")}
      </p>
    </main>
  );
}
