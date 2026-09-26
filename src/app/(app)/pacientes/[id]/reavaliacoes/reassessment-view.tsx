import { Badge } from "@/components/ui/badge";
import type { ReassessmentChangeItem, ReassessmentDetail } from "@/modules/clinico/reassessment-queries";
import {
  CONCLUSION_LABELS,
  EXAM_FIELDS,
  GOALS_STATUS_LABELS,
  REASSESSMENT_FIELDS,
  REASSESSMENT_FIELD_LABELS,
  type ConclusionValue,
  type GoalsStatusValue,
  type ReassessmentField,
} from "@/modules/clinico/reassessment-validation";
import { formatDate } from "../../format";
import { formatDateTime, signatureLabel } from "../avaliacoes/assessment-view";

const fromIso = (value: string) => formatDate(new Date(`${value}T00:00:00.000Z`));
const NOT_INFORMED = "Não informado";

export function ConclusionBadge({ conclusion, pending }: { conclusion: ConclusionValue; pending?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge variant={conclusion === "INDICACAO_ALTA" ? "default" : "secondary"}>{CONCLUSION_LABELS[conclusion]}</Badge>
      {pending && <Badge variant="outline">Ajuste pendente</Badge>}
    </span>
  );
}

// Comparação lado a lado: referência congelada na criação (avaliação de origem e reavaliação anterior do
// mesmo plano) e os achados desta reavaliação. Ausente = "Não informado"; nenhum cálculo entre textos.
export function ReassessmentComparison({ reassessment }: { reassessment: ReassessmentDetail }) {
  const { assessment, previous } = reassessment.reference;
  const rows: { label: string; origin: string | null; previous?: string | null; current: string | null }[] = [
    ...EXAM_FIELDS.map((field) => ({
      label: REASSESSMENT_FIELD_LABELS[field],
      origin: assessment[field],
      previous: previous?.[field],
      current: reassessment[field],
    })),
    {
      label: REASSESSMENT_FIELD_LABELS.painLimitations,
      origin: null,
      previous: previous?.painLimitations,
      current: reassessment.painLimitations,
    },
  ];

  return (
    <section aria-labelledby="reavaliacao-comparacao" className="flex flex-col gap-3">
      <h3 id="reavaliacao-comparacao" className="font-heading text-base font-semibold">
        Comparação com a referência
      </h3>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">
            Achados da avaliação de origem{previous ? ", da reavaliação anterior" : ""} e desta reavaliação, lado a lado
          </caption>
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="p-3 font-medium">
                Achado
              </th>
              <th scope="col" className="p-3 font-medium">
                Avaliação de origem ({fromIso(assessment.assessmentDate)}, versão {assessment.version})
              </th>
              {previous && (
                <th scope="col" className="p-3 font-medium">
                  Reavaliação anterior ({fromIso(previous.reassessmentDate)})
                </th>
              )}
              <th scope="col" className="p-3 font-medium">
                Esta reavaliação ({formatDate(reassessment.reassessmentDate)})
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.label} className="align-top">
                <th scope="row" className="p-3 font-medium text-muted-foreground">
                  {row.label}
                </th>
                <td className="p-3 whitespace-pre-line">{row.origin ?? NOT_INFORMED}</td>
                {previous && <td className="p-3 whitespace-pre-line">{row.previous ?? NOT_INFORMED}</td>}
                <td className="p-3 whitespace-pre-line">{row.current ?? NOT_INFORMED}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Diagnóstico da avaliação de origem: {assessment.diagnosis}. Referências congeladas quando esta reavaliação foi
        registrada; edições posteriores nelas não mudam esta comparação.
      </p>
    </section>
  );
}

export function ReassessmentConclusionView({ reassessment }: { reassessment: ReassessmentDetail }) {
  const revision = reassessment.planRevision;
  return (
    <section
      aria-labelledby="reavaliacao-conclusao"
      className="flex flex-col gap-4 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 sm:p-6"
    >
      <h3 id="reavaliacao-conclusao" className="font-heading text-base font-semibold">
        Evolução, objetivos e conclusão
      </h3>
      <dl className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1 md:col-span-2">
          <dt className="text-sm text-muted-foreground">{REASSESSMENT_FIELD_LABELS.progressSummary}</dt>
          <dd className="text-sm whitespace-pre-line">{reassessment.progressSummary}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">
            Objetivos da revisão {revision.number} do plano ({formatDate(revision.planDate)})
          </dt>
          <dd className="text-sm whitespace-pre-line">{revision.goals}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">{REASSESSMENT_FIELD_LABELS.goalsStatus}</dt>
          <dd className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{GOALS_STATUS_LABELS[reassessment.goalsStatus]}</span>
            <span className="whitespace-pre-line">{reassessment.goalsJustification}</span>
          </dd>
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <dt className="text-sm text-muted-foreground">{REASSESSMENT_FIELD_LABELS.conclusion}</dt>
          <dd className="flex flex-col gap-2 text-sm">
            <ConclusionBadge conclusion={reassessment.conclusion} pending={reassessment.adjustmentPending} />
            <span className="whitespace-pre-line">{reassessment.conclusionSummary}</span>
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        Reavaliação em {formatDate(reassessment.reassessmentDate)} · registrada por{" "}
        {signatureLabel(reassessment.authorNameSnapshot, reassessment.authorCrefitoSnapshot)} em{" "}
        {formatDateTime(reassessment.createdAt)}
      </p>
    </section>
  );
}

const FIELD_ORDER = new Map<string, number>(REASSESSMENT_FIELDS.map((field, index) => [field, index]));

function historyValue(field: string, value: string | null) {
  if (value === null) return NOT_INFORMED;
  if (field === "reassessmentDate") return fromIso(value);
  if (field === "goalsStatus") return GOALS_STATUS_LABELS[value as GoalsStatusValue] ?? value;
  if (field === "conclusion") return CONCLUSION_LABELS[value as ConclusionValue] ?? value;
  return value;
}

export function ReassessmentHistory({ changes }: { changes: ReassessmentChangeItem[] }) {
  if (changes.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma correção desde o registro.</p>;
  const edits = new Map<number, ReassessmentChangeItem[]>();
  for (const change of changes) edits.set(change.version, [...(edits.get(change.version) ?? []), change]);

  return (
    <ol className="flex flex-col gap-2">
      {[...edits.entries()].map(([version, items]) => {
        const first = items[0];
        const sorted = [...items].sort((a, b) => (FIELD_ORDER.get(a.field) ?? 99) - (FIELD_ORDER.get(b.field) ?? 99));
        return (
          <li key={version}>
            <details className="rounded-xl border">
              <summary className="cursor-pointer rounded-xl p-4 text-sm hover:bg-muted/50">
                <span className="font-medium">Correção de {formatDateTime(first.changedAt)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {signatureLabel(first.editorNameSnapshot, first.editorCrefitoSnapshot)} ·{" "}
                  {sorted.length === 1 ? "1 campo alterado" : `${sorted.length} campos alterados`}
                </span>
              </summary>
              <div className="flex flex-col gap-4 border-t p-4">
                <p className="text-sm whitespace-pre-line">
                  <span className="text-muted-foreground">Motivo: </span>
                  {first.reason}
                </p>
                <dl className="flex flex-col gap-4">
                  {sorted.map((change) => (
                    <div key={change.id} className="flex flex-col gap-2">
                      <dt className="text-sm font-medium">
                        {REASSESSMENT_FIELD_LABELS[change.field as ReassessmentField] ?? change.field}
                      </dt>
                      <dd className="grid gap-2 text-sm sm:grid-cols-2">
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground">Antes</p>
                          <p className="whitespace-pre-line">{historyValue(change.field, change.previousValue)}</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground">Depois</p>
                          <p className="whitespace-pre-line">{historyValue(change.field, change.newValue)}</p>
                        </div>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
