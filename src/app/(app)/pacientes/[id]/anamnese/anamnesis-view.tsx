import { Badge } from "@/components/ui/badge";
import type { AnamnesisDetail } from "@/modules/clinico/queries";
import { PAIN_TYPE_LABELS } from "@/modules/clinico/validation";
import { formatDate } from "../../format";

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{value ?? "—"}</dd>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-base font-medium">
        {title}
      </h2>
      <dl className="grid gap-4">{children}</dl>
    </section>
  );
}

// Visualização somente leitura de uma versão da anamnese (vigente ou do histórico).
export function AnamnesisView({ anamnesis }: { anamnesis: AnamnesisDetail }) {
  return (
    <div className="flex flex-col gap-8">
      <Section id="anamnese-queixa" title="Queixa principal e história">
        <Item label="Queixa principal" value={anamnesis.chiefComplaint} />
        <Item label="História da doença atual (HDA)" value={anamnesis.currentIllnessHistory} />
      </Section>

      <Section id="anamnese-historico" title="Histórico clínico e cirúrgico">
        <Item label="Antecedentes pessoais e patológicos" value={anamnesis.personalPathologicalHistory} />
        <Item label="Cirurgias" value={anamnesis.surgeries} />
        <Item label="Medicamentos em uso" value={anamnesis.currentMedications} />
        <Item label="Hábitos e atividade física" value={anamnesis.habitsPhysicalActivity} />
      </Section>

      <Section id="anamnese-dor" title="Dor relatada">
        <div className="grid gap-4 sm:grid-cols-2">
          <Item
            label="Intensidade (EVA 0–10)"
            value={anamnesis.painIntensity === null ? null : `${anamnesis.painIntensity}/10`}
          />
          <Item label="Localização" value={anamnesis.painLocation} />
        </div>
        <Item
          label="Tipo"
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

      <Section id="anamnese-funcional" title="Limitações e objetivos">
        <Item label="Limitações funcionais relatadas" value={anamnesis.functionalLimitations} />
        <Item label="Objetivos do paciente" value={anamnesis.patientGoals} />
      </Section>

      <Section id="anamnese-observacoes" title="Observações">
        <Item label="Observações clínicas" value={anamnesis.clinicalNotes} />
      </Section>

      <p className="border-t pt-4 text-sm text-muted-foreground">
        Avaliação em {formatDate(anamnesis.assessmentDate)} · registrado por{" "}
        <span className="font-medium text-foreground">{anamnesis.authorNameSnapshot}</span> em{" "}
        {anamnesis.createdAt.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}
