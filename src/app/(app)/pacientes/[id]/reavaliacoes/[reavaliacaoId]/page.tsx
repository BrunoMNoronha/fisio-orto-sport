import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { getReassessment, listReassessmentChanges } from "@/modules/clinico/reassessment-queries";
import { getPatient } from "@/modules/pacientes/queries";
import { formatDate } from "../../../format";
import { ReassessmentComparison, ReassessmentConclusionView, ReassessmentHistory } from "../reassessment-view";

export const metadata: Metadata = { title: "Reavaliação — TechLab+ Fisio OrtoSport" };

export default async function ReavaliacaoPage({ params }: PageProps<"/pacientes/[id]/reavaliacoes/[reavaliacaoId]">) {
  const actor = await requirePermission("clinico:ler");
  const { id, reavaliacaoId } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  // Filtrada pelo paciente da URL: id de outro paciente responde 404, sem revelar que existe.
  const reassessment = await getReassessment(patient.id, reavaliacaoId);
  if (!reassessment) notFound();

  const changes = await listReassessmentChanges(patient.id, reassessment.id);
  const active = patient.status === "ATIVO";
  const canManage = can(actor.role, "clinico:gerir") && active;
  const planHref = `/pacientes/${patient.id}/planos/${reassessment.planId}`;
  const canRevise = canManage && reassessment.adjustmentPending && reassessment.plan.status === "ATIVO";
  const base = `/pacientes/${patient.id}/reavaliacoes`;

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">
          ← Reavaliações
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Reavaliação de {formatDate(reassessment.reassessmentDate)}</h2>
          <div className="flex flex-wrap gap-2">
            <Link href={planHref} className={buttonVariants({ variant: "ghost" })}>
              Ver plano
            </Link>
            {canManage && (
              <Link href={`${base}/${reassessment.id}/editar`} className={buttonVariants({ variant: "outline" })}>
                Corrigir
              </Link>
            )}
          </div>
        </div>
      </div>

      {reassessment.adjustmentPending && (
        <Alert>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>
              Ajuste do plano indicado e ainda sem revisão. A reavaliação já está salva; a revisão é uma ação separada.
              {reassessment.plan.status !== "ATIVO" ? " O plano está encerrado: reabra-o para revisar." : ""}
            </span>
            {canRevise && (
              <Link
                href={`${planHref}/revisar?reavaliacao=${reassessment.id}`}
                className={buttonVariants({ size: "sm" })}
              >
                Revisar plano a partir desta reavaliação
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}
      {reassessment.resultingRevision && (
        <p className="text-sm text-muted-foreground">
          Originou a revisão {reassessment.resultingRevision.number} do plano, de{" "}
          {formatDate(reassessment.resultingRevision.planDate)}.
        </p>
      )}
      {reassessment.conclusion === "INDICACAO_ALTA" && (
        <p className="text-sm text-muted-foreground">
          Indicação de alta registrada. Ela não encerra o plano, não inativa o paciente e não altera a agenda; encerre o
          plano manualmente quando for o caso.
        </p>
      )}

      <ReassessmentComparison reassessment={reassessment} />
      <ReassessmentConclusionView reassessment={reassessment} />

      <section aria-labelledby="reavaliacao-historico" className="flex flex-col gap-3">
        <h3 id="reavaliacao-historico" className="font-heading text-base font-semibold">
          Histórico de correções
        </h3>
        <ReassessmentHistory changes={changes} />
      </section>
    </div>
  );
}
