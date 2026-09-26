import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";
import { toLocalDate, toLocalTime } from "@/modules/agenda/validation";
import { updateSession } from "@/modules/clinico/session-actions";
import { getSession, listProfessionalOptions, listSessionChanges } from "@/modules/clinico/session-queries";
import { formatOccurredAt } from "@/modules/clinico/session-validation";
import { getPatient } from "@/modules/pacientes/queries";
import { professionalLabel } from "../../professional-label";
import { SessionForm } from "../../session-form";
import { SessionHistory } from "../../session-view";

export const metadata: Metadata = { title: "Corrigir sessão — TechLab+ Fisio OrtoSport" };

export default async function EditarSessaoPage({ params }: PageProps<"/pacientes/[id]/sessoes/[sessaoId]/editar">) {
  await requirePermission("clinico:gerir");
  const { id, sessaoId } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const session = await getSession(patient.id, sessaoId);
  if (!session) notFound();

  const detail = `/pacientes/${patient.id}/sessoes/${session.id}`;
  // A action também recusa; aqui só evitamos exibir um formulário que não pode ser salvo.
  if (patient.status !== "ATIVO" || session.status !== "VALIDO") redirect(detail);

  const [professionals, changes] = await Promise.all([
    listProfessionalOptions(),
    listSessionChanges(patient.id, session.id),
  ]);
  const text = (value: string | null) => value ?? "";

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={detail} className="text-sm text-muted-foreground hover:text-foreground">
          ← Sessão
        </Link>
        <h2 className="text-xl font-semibold tracking-tight">Corrigir sessão de {formatOccurredAt(session.occurredAt)}</h2>
        <p className="text-sm text-muted-foreground">
          Plano e revisão aplicada não mudam. Cada campo alterado fica no histórico, com o valor anterior, o motivo, a data
          e quem corrigiu.
        </p>
      </div>
      {/* key: numa nova versão do atendimento, o formulário remonta com os valores atuais. */}
      <SessionForm
        key={session.version}
        action={updateSession.bind(null, patient.id, session.id)}
        initial={{
          occurredDate: toLocalDate(session.occurredAt),
          occurredTime: toLocalTime(session.occurredAt),
          professionalId: session.professionalId,
          techniques: text(session.techniques),
          exercises: text(session.exercises),
          observations: text(session.observations),
          evolution: session.evolution,
          nextSteps: text(session.nextSteps),
        }}
        mode={{ kind: "edit", version: session.version }}
        professionals={professionals.map((option) => ({ id: option.id, label: professionalLabel(option) }))}
        cancelHref={detail}
        submitLabel="Salvar correção"
      />
      <details className="rounded-xl border">
        <summary className="cursor-pointer rounded-xl p-4 text-sm font-medium hover:bg-muted/50">Histórico de correções</summary>
        <div className="border-t p-4">
          <SessionHistory changes={changes} />
        </div>
      </details>
    </div>
  );
}
