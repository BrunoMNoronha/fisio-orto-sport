import Link from "next/link";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { PlanRevisionDetail, PlanRevisionItem, PlanStatusChangeItem } from "@/modules/clinico/plan-queries";
import {
  PLAN_FIELD_LABELS,
  PLAN_STATUS_LABELS,
  REVISION_KIND_LABELS,
  type PlanStatusValue,
} from "@/modules/clinico/plan-validation";
import { formatDate } from "../../format";
import { formatDateTime, signatureLabel } from "../avaliacoes/assessment-view";

export function PlanStatusBadge({ status }: { status: PlanStatusValue }) {
  return <Badge variant={status === "ATIVO" ? "secondary" : "outline"}>{PLAN_STATUS_LABELS[status]}</Badge>;
}

function Item({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{value ?? "Não informado"}</dd>
    </div>
  );
}

// Conteúdo completo de uma revisão (vigente ou do histórico). "Não informado" para campos em branco.
export function PlanRevisionView({ revision }: { revision: PlanRevisionDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby={`plano-revisao-${revision.number}`}
        className="flex flex-col gap-4 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 sm:p-6"
      >
        <h3 id={`plano-revisao-${revision.number}`} className="font-heading text-base font-semibold">
          Planejamento
        </h3>
        <dl className="grid gap-4 md:grid-cols-2">
          <Item label={PLAN_FIELD_LABELS.goals} value={revision.goals} className="md:col-span-2" />
          <Item label={PLAN_FIELD_LABELS.conduct} value={revision.conduct} className="md:col-span-2" />
          <Item label={PLAN_FIELD_LABELS.techniques} value={revision.techniques} />
          <Item label={PLAN_FIELD_LABELS.exercises} value={revision.exercises} />
          <Item label={PLAN_FIELD_LABELS.plannedSessions} value={revision.plannedSessions?.toString() ?? null} />
          <Item label={PLAN_FIELD_LABELS.frequency} value={revision.frequency} />
          <Item label={PLAN_FIELD_LABELS.reassessment} value={revision.reassessment} />
          <Item label={PLAN_FIELD_LABELS.notes} value={revision.notes} />
        </dl>
      </section>
      <dl className="grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-3">
        <Item label="Data clínica do plano" value={formatDate(revision.planDate)} />
        <Item
          label={`Revisão ${revision.number}`}
          value={`${REVISION_KIND_LABELS[revision.kind]}${revision.reason ? `: ${revision.reason}` : ""}`}
        />
        <Item
          label="Registrada por"
          value={`${signatureLabel(revision.authorNameSnapshot, revision.authorCrefitoSnapshot)} em ${formatDateTime(revision.createdAt)}`}
        />
      </dl>
    </div>
  );
}

// Histórico de revisões (mais recente primeiro), cada uma com link para o conteúdo congelado.
export function PlanRevisionList({
  revisions,
  current,
  hrefFor,
}: {
  revisions: PlanRevisionItem[];
  current: number;
  hrefFor: (number: number) => string;
}) {
  return (
    <ol className="flex flex-col divide-y rounded-xl border">
      {revisions.map((revision) => (
        <li key={revision.id}>
          <Link href={hrefFor(revision.number)} className="flex flex-col gap-1 p-4 text-sm hover:bg-muted/50">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                Revisão {revision.number} · {REVISION_KIND_LABELS[revision.kind]}
              </span>
              {revision.number === current && <Badge variant="secondary">Vigente</Badge>}
            </span>
            {revision.reason && <span className="whitespace-pre-line">Motivo: {revision.reason}</span>}
            {revision.motivatingReassessment && (
              <span>A partir da reavaliação de {formatDate(revision.motivatingReassessment.reassessmentDate)}</span>
            )}
            <span className="text-muted-foreground">
              Data do plano {formatDate(revision.planDate)} ·{" "}
              {signatureLabel(revision.authorNameSnapshot, revision.authorCrefitoSnapshot)} · salva em{" "}
              {formatDateTime(revision.createdAt)}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function PlanStatusHistory({ changes }: { changes: PlanStatusChangeItem[] }) {
  if (changes.length === 0) return <p className="text-sm text-muted-foreground">Sem mudanças de estado desde a criação.</p>;
  return (
    <ol className="flex flex-col divide-y rounded-xl border">
      {changes.map((change) => (
        <li key={change.id} className="flex flex-col gap-1 p-4 text-sm">
          <span className="font-medium">
            {change.toStatus === "ENCERRADO" ? "Encerrado" : "Reaberto"} em {formatDateTime(change.createdAt)}
          </span>
          <span className="whitespace-pre-line">Motivo: {change.reason}</span>
          <span className="text-muted-foreground">
            {signatureLabel(change.authorNameSnapshot, change.authorCrefitoSnapshot)}
          </span>
        </li>
      ))}
    </ol>
  );
}
