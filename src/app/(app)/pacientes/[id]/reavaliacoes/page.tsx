import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { countActivePlans } from "@/modules/clinico/plan-queries";
import { listReassessments } from "@/modules/clinico/reassessment-queries";
import { GOALS_STATUS_LABELS, reassessmentPageSchema } from "@/modules/clinico/reassessment-validation";
import { getPatient } from "@/modules/pacientes/queries";
import { firstParam } from "@/modules/pacientes/validation";
import { formatDate } from "../../format";
import { formatDateTime } from "../avaliacoes/assessment-view";
import { ConclusionBadge } from "./reassessment-view";

// Metadata genérica: nunca inclui nome do paciente nem conteúdo clínico.
export const metadata: Metadata = { title: "Reavaliações — TechLab+ Fisio OrtoSport" };

export default async function ReavaliacoesPage({ params, searchParams }: PageProps<"/pacientes/[id]/reavaliacoes">) {
  const actor = await requirePermission("clinico:ler");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const requestedPage = reassessmentPageSchema.parse(firstParam((await searchParams).pagina));
  const [{ items, total, page, pageCount }, activePlans] = await Promise.all([
    listReassessments(patient.id, requestedPage),
    countActivePlans(patient.id),
  ]);
  const active = patient.status === "ATIVO";
  const canManage = can(actor.role, "clinico:gerir") && active;
  const base = `/pacientes/${patient.id}/reavaliacoes`;
  const pageHref = (target: number) => (target <= 1 ? base : `${base}?pagina=${target}`);

  return (
    <div className="w-full max-w-3xl flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Reavaliações</h2>
        {canManage && activePlans > 0 && (
          <Link href={`${base}/nova`} className={buttonVariants()}>
            Nova reavaliação
          </Link>
        )}
      </div>

      {!active && (
        <Alert>
          <AlertDescription>
            Paciente inativo: as reavaliações podem ser consultadas, mas registrar ou corrigir só após a reativação do
            cadastro.
          </AlertDescription>
        </Alert>
      )}

      {canManage && activePlans === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <p className="text-sm text-muted-foreground">
            A reavaliação pertence a um plano terapêutico ativo. Crie (ou reabra) um plano deste paciente primeiro.
          </p>
          <Link href={`/pacientes/${patient.id}/planos`} className={buttonVariants({ variant: "outline" })}>
            Ir para Planos
          </Link>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {total === 0 ? "Nenhuma reavaliação registrada para este paciente." : "Nenhuma reavaliação nesta página."}
        </p>
      ) : (
        <ol className="flex flex-col divide-y rounded-xl border">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`${base}/${item.id}`} className="flex flex-col gap-1.5 p-4 text-sm hover:bg-muted/50">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Reavaliação de {formatDate(item.reassessmentDate)}</span>
                  <ConclusionBadge conclusion={item.conclusion} pending={item.adjustmentPending} />
                </span>
                <span>Objetivos: {GOALS_STATUS_LABELS[item.goalsStatus]}</span>
                <span className="text-muted-foreground">
                  {item.authorNameSnapshot} · registrada em {formatDateTime(item.createdAt)}
                  {item.resultingRevisionNumber ? ` · originou a revisão ${item.resultingRevisionNumber} do plano` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {total > 0 && (
        <nav aria-label="Paginação das reavaliações" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "reavaliação" : "reavaliações"} · página {Math.min(page, pageCount)} de {pageCount}
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
