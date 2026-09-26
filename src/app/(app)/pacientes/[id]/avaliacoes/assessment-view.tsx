import { cn } from "cn";
import { CLINIC_TIMEZONE } from "@/modules/agenda/validation";
import type { AssessmentChangeItem, AssessmentDetail } from "@/modules/clinico/assessment-queries";
import { ASSESSMENT_FIELDS, ASSESSMENT_FIELD_LABELS, type AssessmentField } from "@/modules/clinico/assessment-validation";
import { formatDate } from "../../format";

// Momento técnico (registro/edição) no fuso da clínica.
export function formatDateTime(date: Date) {
  return date.toLocaleString("pt-BR", { timeZone: CLINIC_TIMEZONE, dateStyle: "short", timeStyle: "short" });
}

export function signatureLabel(name: string, crefito: string | null) {
  return crefito ? `${name} (CREFITO ${crefito})` : name;
}

function Item({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{value ?? "Não informado"}</dd>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 sm:p-6"
    >
      <h3 id={id} className="font-heading text-base font-semibold">
        {title}
      </h3>
      <dl className="grid gap-4 md:grid-cols-2">{children}</dl>
    </section>
  );
}

// Visualização somente leitura da avaliação, com todos os campos salvos.
// "Não informado" deixa explícito que o campo ficou em branco (nunca "normal").
export function AssessmentView({ assessment }: { assessment: AssessmentDetail }) {
  const text = (field: Exclude<AssessmentField, "assessmentDate">, className?: string) => (
    <Item label={ASSESSMENT_FIELD_LABELS[field]} value={assessment[field]} className={className} />
  );
  return (
    <div className="flex flex-col gap-4">
      <Section id="avaliacao-exame" title="Exame físico">
        {text("inspection")}
        {text("palpation")}
        {text("functionalGait")}
        {text("rangeOfMotion")}
        {text("muscleStrength")}
        {text("specialTests")}
      </Section>
      <Section id="avaliacao-sintese" title="Síntese">
        {text("diagnosis", "md:col-span-2")}
        {text("therapeuticGoals")}
        {text("clinicalNotes")}
      </Section>
      <dl className="grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-3">
        <Item label="Data clínica da avaliação" value={formatDate(assessment.assessmentDate)} />
        <Item
          label="Registrada por"
          value={`${signatureLabel(assessment.authorNameSnapshot, assessment.authorCrefitoSnapshot)} em ${formatDateTime(assessment.createdAt)}`}
        />
        <Item
          label="Última edição"
          value={assessment.version > 1 ? formatDateTime(assessment.updatedAt) : "Sem edições"}
        />
      </dl>
    </div>
  );
}

function changeValue(field: string, value: string | null) {
  if (value === null) return "Não informado";
  if (field === "assessmentDate") return formatDate(new Date(`${value}T00:00:00.000Z`));
  return value;
}

const FIELD_ORDER = new Map<string, number>(ASSESSMENT_FIELDS.map((field, index) => [field, index]));

// Histórico por campo (D2), agrupado por edição, em acordeão nativo (<details>): teclado e leitor de
// tela funcionam sem JavaScript. Mostra valor anterior, novo valor e a assinatura de quem editou.
export function AssessmentHistory({ changes }: { changes: AssessmentChangeItem[] }) {
  if (changes.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma edição desde o registro.</p>;
  }
  const edits = new Map<number, AssessmentChangeItem[]>();
  for (const change of changes) edits.set(change.version, [...(edits.get(change.version) ?? []), change]);

  return (
    <ol className="flex flex-col gap-2">
      {[...edits.entries()].map(([version, items]) => {
        const first = items[0];
        const sorted = [...items].sort((a, b) => (FIELD_ORDER.get(a.field) ?? 99) - (FIELD_ORDER.get(b.field) ?? 99));
        return (
          <li key={version}>
            <details className="group rounded-xl border">
              <summary className="cursor-pointer rounded-xl p-4 text-sm outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
                <span className="font-medium">Edição de {formatDateTime(first.changedAt)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {signatureLabel(first.editorNameSnapshot, first.editorCrefitoSnapshot)} ·{" "}
                  {sorted.length === 1 ? "1 campo alterado" : `${sorted.length} campos alterados`}
                </span>
              </summary>
              <dl className="flex flex-col gap-4 border-t p-4">
                {sorted.map((change) => (
                  <div key={change.id} className="flex flex-col gap-2">
                    <dt className="text-sm font-medium">
                      {ASSESSMENT_FIELD_LABELS[change.field as AssessmentField] ?? change.field}
                    </dt>
                    <dd className="grid gap-2 text-sm sm:grid-cols-2">
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Antes</p>
                        <p className="whitespace-pre-line">{changeValue(change.field, change.previousValue)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Depois</p>
                        <p className="whitespace-pre-line">{changeValue(change.field, change.newValue)}</p>
                      </div>
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
