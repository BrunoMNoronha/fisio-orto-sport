import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { countActivePlans } from "@/modules/clinico/plan-queries";
import { listSessions } from "@/modules/clinico/session-queries";
import { formatOccurredAt, sessionPageSchema } from "@/modules/clinico/session-validation";
import { getPatient } from "@/modules/pacientes/queries";
import { firstParam } from "@/modules/pacientes/validation";
import { formatDateTime } from "../avaliacoes/assessment-view";
import { SessionStatusBadge } from "./session-view";

// Metadata genérica: nunca inclui nome do paciente nem conteúdo clínico.
export const metadata: Metadata = { title: "Sessões — TechLab+ Fisio OrtoSport" };

// Histórico cronológico de atendimentos (com a evolução de cada um), do mais recente ao mais antigo.
export default async function SessoesPage({ params, searchParams }: PageProps<"/pacientes/[id]/sessoes">) {
  const actor = await requirePermission("clinico:ler");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const requestedPage = sessionPageSchema.parse(firstParam((await searchParams).pagina));
  const [{ items, total, page, pageCount }, activePlans] = await Promise.all([
    listSessions(patient.id, requestedPage),
    countActivePlans(patient.id),
  ]);
  const active = patient.status === "ATIVO";
  const canManage = can(actor.role, "clinico:gerir") && active;
  const hasActivePlan = activePlans > 0;
  const base = `/pacientes/${patient.id}/sessoes`;
  const pageHref = (target: number) => (target <= 1 ? base : `${base}?pagina=${target}`);

  return (
    <div className="w-full max-w-3xl flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Sessões</h2>
        {canManage && hasActivePlan && (
          <Link href={`${base}/nova`} className={buttonVariants()}>
            Registrar sessão
          </Link>
        )}
      </div>

      {!active && (
        <Alert>
          <AlertDescription>
            Paciente inativo: as sessões podem ser consultadas, mas registrar, corrigir ou invalidar só após a reativação
            do cadastro.
          </AlertDescription>
        </Alert>
      )}

      {canManage && !hasActivePlan && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <p className="text-sm text-muted-foreground">
            Toda sessão pertence a um plano terapêutico ativo. Crie (ou reabra) um plano deste paciente primeiro.
          </p>
          <Link href={`/pacientes/${patient.id}/planos`} className={buttonVariants({ variant: "outline" })}>
            Ir para Planos
          </Link>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {total === 0 ? "Nenhuma sessão registrada para este paciente." : "Nenhuma sessão nesta página."}
        </p>
      ) : (
        <ol className="flex flex-col divide-y rounded-xl border">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`${base}/${item.id}`} className="flex flex-col gap-1 p-4 text-sm hover:bg-muted/50">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Sessão de {formatOccurredAt(item.occurredAt)}</span>
                  {item.status !== "VALIDO" && <SessionStatusBadge status={item.status} />}
                  {item.version > 1 && item.status === "VALIDO" && (
                    <span className="text-xs text-muted-foreground">corrigida</span>
                  )}
                </span>
                <span className="line-clamp-2 whitespace-pre-line">{item.evolution}</span>
                <span className="text-muted-foreground">
                  {item.professionalNameSnapshot} · revisão {item.planRevision.number} do plano · lançada em{" "}
                  {formatDateTime(item.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {total > 0 && (
        <nav aria-label="Paginação das sessões" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "sessão" : "sessões"} · página {Math.min(page, pageCount)} de {pageCount}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageHref(Math.min(page - 1, pageCount))}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Anterior
              </Link>
            )}
            {page < pageCount && (
              <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Próxima
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
