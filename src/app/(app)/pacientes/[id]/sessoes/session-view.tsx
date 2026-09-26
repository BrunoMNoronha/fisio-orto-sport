import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { SessionChangeItem, SessionDetail } from "@/modules/clinico/session-queries";
import {
  SESSION_FIELD_LABELS,
  SESSION_HISTORY_FIELDS,
  SESSION_STATUS_LABELS,
  formatOccurredAt,
  type SessionHistoryField,
  type SessionStatusValue,
} from "@/modules/clinico/session-validation";
import { formatDate } from "../../format";
import { formatDateTime, signatureLabel } from "../avaliacoes/assessment-view";

export function SessionStatusBadge({ status }: { status: SessionStatusValue }) {
  return <Badge variant={status === "VALIDO" ? "secondary" : "destructive"}>{SESSION_STATUS_LABELS[status]}</Badge>;
}

function Item({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{value ?? "Não informado"}</dd>
    </div>
  );
}

// Detalhe do atendimento: o que foi realizado, a evolução, a revisão exata do plano e as assinaturas.
export function SessionView({ session }: { session: SessionDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby="sessao-conteudo"
        className="flex flex-col gap-4 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 sm:p-6"
      >
        <h3 id="sessao-conteudo" className="font-heading text-base font-semibold">
          Atendimento
        </h3>
        <dl className="grid gap-4 md:grid-cols-2">
          <Item label={SESSION_FIELD_LABELS.evolution} value={session.evolution} className="md:col-span-2" />
          <Item label={SESSION_FIELD_LABELS.techniques} value={session.techniques} />
          <Item label={SESSION_FIELD_LABELS.exercises} value={session.exercises} />
          <Item label={SESSION_FIELD_LABELS.observations} value={session.observations} />
          <Item label={SESSION_FIELD_LABELS.nextSteps} value={session.nextSteps} />
        </dl>
      </section>
      <dl className="grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Item label="Momento do atendimento" value={formatOccurredAt(session.occurredAt)} />
        <Item
          label="Profissional responsável"
          value={signatureLabel(session.professionalNameSnapshot, session.professionalCrefitoSnapshot)}
        />
        <Item
          label="Revisão do plano aplicada"
          value={`Revisão ${session.planRevision.number}, de ${formatDate(session.planRevision.planDate)}${
            session.planRevision.number === session.plan.currentRevision ? " (vigente)" : " (substituída depois)"
          }`}
        />
        <Item
          label="Lançado por"
          value={`${signatureLabel(session.authorNameSnapshot, session.authorCrefitoSnapshot)} em ${formatDateTime(session.createdAt)}`}
        />
      </dl>
    </div>
  );
}

const FIELD_ORDER = new Map<string, number>(SESSION_HISTORY_FIELDS.map((field, index) => [field, index]));

// Histórico de correções, agrupado por edição, em acordeão nativo; cada edição mostra o motivo.
export function SessionHistory({ changes }: { changes: SessionChangeItem[] }) {
  if (changes.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma correção desde o registro.</p>;
  const edits = new Map<number, SessionChangeItem[]>();
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
                        {SESSION_FIELD_LABELS[change.field as SessionHistoryField] ?? change.field}
                      </dt>
                      <dd className="grid gap-2 text-sm sm:grid-cols-2">
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground">Antes</p>
                          <p className="whitespace-pre-line">{change.previousValue ?? "Não informado"}</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground">Depois</p>
                          <p className="whitespace-pre-line">{change.newValue ?? "Não informado"}</p>
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
