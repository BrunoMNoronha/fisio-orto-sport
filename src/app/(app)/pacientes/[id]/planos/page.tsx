import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { listAssessments } from "@/modules/clinico/assessment-queries";
import { listPlans } from "@/modules/clinico/plan-queries";
import { planPageSchema } from "@/modules/clinico/plan-validation";
import { getPatient } from "@/modules/pacientes/queries";
import { firstParam } from "@/modules/pacientes/validation";
import { formatDate } from "../../format";
import { formatDateTime } from "../avaliacoes/assessment-view";
import { PlanStatusBadge } from "./plan-view";

// Metadata genérica: nunca inclui nome do paciente nem conteúdo clínico.
export const metadata: Metadata = { title: "Planos terapêuticos — TechLab+ Fisio OrtoSport" };

// Lista só metadados (estado, datas, revisão vigente, autoria); o conteúdo abre no detalhe.
export default async function PlanosPage({ params, searchParams }: PageProps<"/pacientes/[id]/planos">) {
  const actor = await requirePermission("clinico:ler");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const requestedPage = planPageSchema.parse(firstParam((await searchParams).pagina));
  const [{ items, total, page, pageCount }, assessments] = await Promise.all([
    listPlans(patient.id, requestedPage),
    listAssessments(patient.id, 1),
  ]);
  const active = patient.status === "ATIVO";
  const canManage = can(actor.role, "clinico:gerir") && active;
  const hasAssessment = assessments.total > 0;
  const base = `/pacientes/${patient.id}/planos`;
  const pageHref = (target: number) => (target <= 1 ? base : `${base}?pagina=${target}`);

  return (
    <div className="w-full max-w-3xl flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Planos terapêuticos</h2>
        {canManage && hasAssessment && (
          <Link href={`${base}/novo`} className={buttonVariants()}>
            Novo plano
          </Link>
        )}
      </div>

      {!active && (
        <Alert>
          <AlertDescription>
            Paciente inativo: os planos podem ser consultados, mas criar, revisar, encerrar ou reabrir só após a
            reativação do cadastro.
          </AlertDescription>
        </Alert>
      )}

      {canManage && !hasAssessment && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <p className="text-sm text-muted-foreground">
            O plano terapêutico decorre de uma avaliação inicial. Registre a avaliação deste paciente primeiro.
          </p>
          <Link href={`/pacientes/${patient.id}/avaliacoes`} className={buttonVariants({ variant: "outline" })}>
            Ir para Avaliações
          </Link>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {total === 0 ? "Nenhum plano terapêutico registrado para este paciente." : "Nenhum plano nesta página."}
        </p>
      ) : (
        <ol className="flex flex-col divide-y rounded-xl border">
          {items.map((plan) => (
            <li key={plan.id}>
              <Link href={`${base}/${plan.id}`} className="flex flex-col gap-1 p-4 text-sm hover:bg-muted/50">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    Plano de {plan.revisions[0] ? formatDate(plan.revisions[0].planDate) : "—"}
                  </span>
                  <PlanStatusBadge status={plan.status} />
                  <span className="text-muted-foreground">revisão vigente {plan.currentRevision}</span>
                </span>
                <span className="text-muted-foreground">
                  Da avaliação de {formatDate(plan.assessment.assessmentDate)} · criado por {plan.authorNameSnapshot} em{" "}
                  {formatDateTime(plan.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {total > 0 && (
        <nav aria-label="Paginação dos planos" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "plano" : "planos"} · página {Math.min(page, pageCount)} de {pageCount}
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
