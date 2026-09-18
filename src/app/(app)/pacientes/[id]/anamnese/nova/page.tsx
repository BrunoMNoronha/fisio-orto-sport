import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";
import { createAnamnesisVersion } from "@/modules/clinico/actions";
import { getCurrentAnamnesis, type AnamnesisDetail } from "@/modules/clinico/queries";
import { getPatient } from "@/modules/pacientes/queries";
import { formatDate } from "../../../format";
import { AnamnesisForm, type AnamnesisFormValues } from "../anamnesis-form";

export const metadata: Metadata = { title: "Nova anamnese — TechLab+ Fisio OrtoSport" };

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Nova versão parte da vigente (reaproveita o texto), mas com a data de hoje.
function toFormValues(current: AnamnesisDetail | null): AnamnesisFormValues {
  const text = (value: string | null | undefined) => value ?? "";
  return {
    assessmentDate: todayIso(),
    chiefComplaint: text(current?.chiefComplaint),
    currentIllnessHistory: text(current?.currentIllnessHistory),
    personalPathologicalHistory: text(current?.personalPathologicalHistory),
    surgeries: text(current?.surgeries),
    currentMedications: text(current?.currentMedications),
    habitsPhysicalActivity: text(current?.habitsPhysicalActivity),
    painIntensity: current?.painIntensity == null ? "" : String(current.painIntensity),
    painLocation: text(current?.painLocation),
    functionalLimitations: text(current?.functionalLimitations),
    patientGoals: text(current?.patientGoals),
    clinicalNotes: text(current?.clinicalNotes),
  };
}

export default async function NovaAnamnesePage({ params }: PageProps<"/pacientes/[id]/anamnese/nova">) {
  await requirePermission("clinico:gerir");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const base = `/pacientes/${patient.id}/anamnese`;
  // A action também recusa; aqui só evitamos exibir um formulário que não pode ser salvo.
  if (patient.status !== "ATIVO") redirect(base);

  const current = await getCurrentAnamnesis(patient.id);

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">
            ← Anamnese
          </Link>
          <h2 className="text-xl font-semibold tracking-tight">
            {current ? "Nova versão da anamnese" : "Registrar anamnese"}
          </h2>
        </div>
        {current && (
          <p className="text-sm text-muted-foreground">Baseada na versão de {formatDate(current.assessmentDate)}</p>
        )}
      </div>
      <AnamnesisForm
        action={createAnamnesisVersion.bind(null, patient.id)}
        initial={toFormValues(current)}
        initialPainTypes={current?.painTypes ?? []}
        cancelHref={base}
      />
    </div>
  );
}
