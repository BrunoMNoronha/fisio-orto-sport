import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";
import { getCurrentAnamnesis } from "@/modules/clinico/queries";
import { PAIN_TYPE_LABELS } from "@/modules/clinico/validation";
import { getAnamnesisAuthor } from "@/modules/pacientes/documents";
import { getPatient } from "@/modules/pacientes/queries";
import { SEX_LABELS } from "@/modules/pacientes/validation";
import { ANAMNESIS_STEPS } from "../../../../(app)/pacientes/[id]/anamnese/anamnesis-steps";
import { formatAge, formatDate } from "../../../../(app)/pacientes/format";
import { DocumentHeader, FillField, Sheet, SignatureLine } from "../../../document-parts";

export async function generateMetadata({ params }: PageProps<"/impressao/pacientes/[id]/anamnese">): Promise<Metadata> {
  const patient = await getPatient((await params).id);
  return { title: `Anamnese - ${patient?.fullName ?? "Paciente"}` };
}

function Item({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 break-inside-avoid" : "break-inside-avoid"}>
      <dt className="text-[9pt] font-semibold text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line">{value ?? "—"}</dd>
    </div>
  );
}

function Section({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="border-b border-brand-navy pb-0.5 font-bold text-brand-navy uppercase">
        {index + 1}. {ANAMNESIS_STEPS[index].title}
      </h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2">{children}</dl>
    </section>
  );
}

// Anamnese vigente para impressão. Mesmo agrupamento da visualização (ANAMNESIS_STEPS).
export default async function AnamneseImpressaoPage({ params }: PageProps<"/impressao/pacientes/[id]/anamnese">) {
  await requirePermission("clinico:ler");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();
  const [anamnesis, author] = await Promise.all([getCurrentAnamnesis(patient.id), getAnamnesisAuthor(patient.id)]);
  if (!anamnesis) notFound();

  return (
    <Sheet className="flex flex-col gap-5">
      <DocumentHeader title="Ficha de anamnese fisioterapêutica" />

      <div className="grid grid-cols-6 gap-x-6 gap-y-1.5">
        <FillField label="Paciente" value={patient.fullName} className="col-span-6" />
        <FillField label="Nascimento" value={formatDate(patient.birthDate)} className="col-span-2" />
        <FillField label="Idade" value={formatAge(patient.birthDate)} className="col-span-2" />
        <FillField label="Sexo" value={patient.sex && SEX_LABELS[patient.sex]} className="col-span-2" />
        <FillField label="Profissão" value={patient.occupation} className="col-span-4" />
        <FillField label="Avaliação" value={formatDate(anamnesis.assessmentDate)} className="col-span-2" />
      </div>

      <Section index={0}>
        <Item label="Queixa principal" value={anamnesis.chiefComplaint} wide />
        <Item label="História da doença atual (HDA)" value={anamnesis.currentIllnessHistory} wide />
      </Section>

      <Section index={1}>
        <Item
          label="Intensidade (EVA 0–10)"
          value={anamnesis.painIntensity === null ? null : `${anamnesis.painIntensity}/10`}
        />
        <Item label="Localização" value={anamnesis.painLocation} />
        <Item
          label="Característica"
          value={anamnesis.painTypes.length ? anamnesis.painTypes.map((t) => PAIN_TYPE_LABELS[t]).join(", ") : null}
          wide
        />
      </Section>

      <Section index={2}>
        <Item label="Antecedentes pessoais e patológicos" value={anamnesis.personalPathologicalHistory} wide />
        <Item label="Cirurgias" value={anamnesis.surgeries} />
        <Item label="Medicamentos em uso" value={anamnesis.currentMedications} />
        <Item label="Hábitos e atividade física" value={anamnesis.habitsPhysicalActivity} wide />
      </Section>

      <Section index={3}>
        <Item label="Limitações funcionais relatadas" value={anamnesis.functionalLimitations} />
        <Item label="Objetivos do paciente" value={anamnesis.patientGoals} />
        <Item label="Observações clínicas" value={anamnesis.clinicalNotes} wide />
      </Section>

      <div className="mt-auto flex break-inside-avoid justify-end pt-12">
        <div className="w-1/2">
          <SignatureLine
            label="Fisioterapeuta"
            name={[anamnesis.authorNameSnapshot, author?.crefito && `CREFITO ${author.crefito}`]
              .filter(Boolean)
              .join(" · ")}
          />
        </div>
      </div>
    </Sheet>
  );
}
