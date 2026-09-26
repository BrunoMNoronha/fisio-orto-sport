import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { changePlanStatus } from "@/modules/clinico/plan-actions";
import { getPlan, listPlanRevisions, listPlanStatusChanges } from "@/modules/clinico/plan-queries";
import { getPatient } from "@/modules/pacientes/queries";
import { formatDate } from "../../../format";
import { formatDateTime, signatureLabel } from "../../avaliacoes/assessment-view";
import { PlanStatusDialog } from "../plan-status-dialog";
import { PlanRevisionList, PlanRevisionView, PlanStatusBadge, PlanStatusHistory } from "../plan-view";

export const metadata: Metadata = { title: "Plano terapêutico — TechLab+ Fisio OrtoSport" };

export default async function PlanoPage({ params }: PageProps<"/pacientes/[id]/planos/[planoId]">) {
  const actor = await requirePermission("clinico:ler");
  const { id, planoId } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  // Filtrado pelo paciente da URL: id de outro paciente responde 404, sem revelar que existe.
  const plan = await getPlan(patient.id, planoId);
  if (!plan) notFound();

  const [revisions, statusChanges] = await Promise.all([
    listPlanRevisions(patient.id, plan.id),
    listPlanStatusChanges(patient.id, plan.id),
  ]);
  const active = patient.status === "ATIVO";
  const canManage = can(actor.role, "clinico:gerir") && active;
  const base = `/pacientes/${patient.id}/planos`;
  const originHref = `/pacientes/${patient.id}/avaliacoes/${plan.assessment.id}`;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">
          ← Planos terapêuticos
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Plano terapêutico de {formatDate(plan.current.planDate)}</h2>
            <PlanStatusBadge status={plan.status} />
          </div>
          {canManage && (
            <div className="flex flex-wrap items-start gap-2">
              {plan.status === "ATIVO" && (
                <Link href={`${base}/${plan.id}/revisar`} className={buttonVariants()}>
                  Revisar plano
                </Link>
              )}
              <PlanStatusDialog action={changePlanStatus.bind(null, patient.id, plan.id)} status={plan.status} />
            </div>
          )}
        </div>
      </div>

      {!active && (
        <Alert>
          <AlertDescription>Paciente inativo: o plano pode ser consultado, mas não revisado nem encerrado.</AlertDescription>
        </Alert>
      )}

      <dl className="grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Origem</dt>
          <dd>
            <Link href={originHref} className="underline underline-offset-4">
              Avaliação inicial de {formatDate(plan.assessment.assessmentDate)}
            </Link>{" "}
            (versão {plan.assessmentVersion})
            {plan.assessment.version > plan.assessmentVersion && (
              <span className="block text-muted-foreground">
                A avaliação foi editada depois (versão atual {plan.assessment.version}); o plano não muda por isso.
              </span>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Revisão vigente</dt>
          <dd>
            {plan.currentRevision} de {revisions.length}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Plano criado por</dt>
          <dd>
            {signatureLabel(plan.authorNameSnapshot, plan.authorCrefitoSnapshot)} em {formatDateTime(plan.createdAt)}
          </dd>
        </div>
      </dl>

      <PlanRevisionView revision={plan.current} />

      <section aria-labelledby="plano-revisoes" className="flex flex-col gap-3">
        <h3 id="plano-revisoes" className="font-heading text-base font-semibold">
          Histórico de revisões
        </h3>
        <PlanRevisionList
          revisions={revisions}
          current={plan.currentRevision}
          hrefFor={(number) => `${base}/${plan.id}/revisoes/${number}`}
        />
      </section>

      <section aria-labelledby="plano-estados" className="flex flex-col gap-3">
        <h3 id="plano-estados" className="font-heading text-base font-semibold">
          Encerramentos e reaberturas
        </h3>
        <PlanStatusHistory changes={statusChanges} />
      </section>
    </div>
  );
}
