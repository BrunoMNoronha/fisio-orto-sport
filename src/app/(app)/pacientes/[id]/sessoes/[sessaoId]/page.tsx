import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { invalidateSession } from "@/modules/clinico/session-actions";
import { getSession, listSessionChanges } from "@/modules/clinico/session-queries";
import { formatOccurredAt } from "@/modules/clinico/session-validation";
import { getPatient } from "@/modules/pacientes/queries";
import { formatDateTime } from "../../avaliacoes/assessment-view";
import { InvalidateSessionDialog } from "../invalidate-session-dialog";
import { SessionHistory, SessionStatusBadge, SessionView } from "../session-view";

export const metadata: Metadata = { title: "Sessão — TechLab+ Fisio OrtoSport" };

export default async function SessaoPage({ params }: PageProps<"/pacientes/[id]/sessoes/[sessaoId]">) {
  const actor = await requirePermission("clinico:ler");
  const { id, sessaoId } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  // Filtrada pelo paciente da URL: id de outro paciente responde 404, sem revelar que existe.
  const session = await getSession(patient.id, sessaoId);
  if (!session) notFound();

  const changes = await listSessionChanges(patient.id, session.id);
  const valid = session.status === "VALIDO";
  const canManage = can(actor.role, "clinico:gerir") && patient.status === "ATIVO" && valid;
  const base = `/pacientes/${patient.id}/sessoes`;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">
          ← Sessões
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Sessão de {formatOccurredAt(session.occurredAt)}</h2>
            <SessionStatusBadge status={session.status} />
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <Link href={`/pacientes/${patient.id}/planos/${session.planId}`} className={buttonVariants({ variant: "ghost" })}>
              Ver plano
            </Link>
            {canManage && (
              <>
                <Link href={`${base}/${session.id}/editar`} className={buttonVariants({ variant: "outline" })}>
                  Corrigir
                </Link>
                <InvalidateSessionDialog action={invalidateSession.bind(null, patient.id, session.id)} />
              </>
            )}
          </div>
        </div>
      </div>

      {!valid && session.invalidatedAt && (
        <Alert variant="destructive">
          <AlertDescription>
            Invalidada em {formatDateTime(session.invalidatedAt)} por {session.invalidatedByNameSnapshot}: {session.invalidationReason}.
            Não conta como sessão realizada.
          </AlertDescription>
        </Alert>
      )}

      <SessionView session={session} />

      <section aria-labelledby="sessao-historico" className="flex flex-col gap-3">
        <h3 id="sessao-historico" className="font-heading text-base font-semibold">
          Histórico de correções
        </h3>
        <SessionHistory changes={changes} />
      </section>
    </div>
  );
}
