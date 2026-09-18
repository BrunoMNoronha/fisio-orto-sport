import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { AnamnesisDetail } from "@/modules/clinico/queries";
import { PAIN_TYPE_LABELS } from "@/modules/clinico/validation";
import { formatDate } from "../../format";
import { ANAMNESIS_STEPS } from "./anamnesis-steps";

function Item({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{value ?? "—"}</dd>
    </div>
  );
}

function Section({ index, children }: { index: number; children: React.ReactNode }) {
  const { id, title } = ANAMNESIS_STEPS[index];
  const headingId = `anamnese-${id}`;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 sm:p-6"
    >
      <h2 id={headingId} className="flex items-center gap-2.5 font-heading text-base font-semibold">
        <span
          aria-hidden
          className="flex size-6.5 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary"
        >
          {index + 1}
        </span>
        {title}
      </h2>
      <dl className="grid gap-4 md:grid-cols-2">{children}</dl>
    </section>
  );
}

function PainIntensity({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-3">
      <span className="font-semibold">{value}/10</span>
      <span aria-hidden className="h-2 w-40 max-w-full overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${value * 10}%` }} />
      </span>
    </span>
  );
}

// Visualização somente leitura de uma versão da anamnese (vigente ou do histórico).
// Segue o mesmo agrupamento das etapas do formulário (ANAMNESIS_STEPS).
export function AnamnesisView({ anamnesis }: { anamnesis: AnamnesisDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <Section index={0}>
        <Item label="Data da avaliação" value={formatDate(anamnesis.assessmentDate)} />
        <Item label="Queixa principal" value={anamnesis.chiefComplaint} className="md:col-span-2" />
        <Item label="História da doença atual (HDA)" value={anamnesis.currentIllnessHistory} className="md:col-span-2" />
      </Section>

      <Section index={1}>
        <Item
          label="Intensidade (EVA 0–10)"
          value={anamnesis.painIntensity === null ? null : <PainIntensity value={anamnesis.painIntensity} />}
        />
        <Item label="Localização" value={anamnesis.painLocation} />
        <Item
          label="Característica"
          className="md:col-span-2"
          value={
            anamnesis.painTypes.length ? (
              <span className="flex flex-wrap gap-2">
                {anamnesis.painTypes.map((type) => (
                  <Badge key={type} variant="secondary">
                    {PAIN_TYPE_LABELS[type]}
                  </Badge>
                ))}
              </span>
            ) : null
          }
        />
      </Section>

      <Section index={2}>
        <Item
          label="Antecedentes pessoais e patológicos"
          value={anamnesis.personalPathologicalHistory}
          className="md:col-span-2"
        />
        <Item label="Cirurgias" value={anamnesis.surgeries} />
        <Item label="Medicamentos em uso" value={anamnesis.currentMedications} />
        <Item label="Hábitos e atividade física" value={anamnesis.habitsPhysicalActivity} className="md:col-span-2" />
      </Section>

      <Section index={3}>
        <Item label="Limitações funcionais relatadas" value={anamnesis.functionalLimitations} />
        <Item label="Objetivos do paciente" value={anamnesis.patientGoals} />
        <Item label="Observações clínicas" value={anamnesis.clinicalNotes} className="md:col-span-2" />
      </Section>

      <p className="pt-2 text-sm text-muted-foreground">
        Avaliação em {formatDate(anamnesis.assessmentDate)} · registrado por{" "}
        <span className="font-medium text-foreground">{anamnesis.authorNameSnapshot}</span> em{" "}
        {anamnesis.createdAt.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}
