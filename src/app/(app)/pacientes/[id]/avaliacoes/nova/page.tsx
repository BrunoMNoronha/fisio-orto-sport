import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";
import { toLocalDate } from "@/modules/agenda/validation";
import { createAssessment } from "@/modules/clinico/assessment-actions";
import { getCurrentAnamnesis, listAnamnesisVersions } from "@/modules/clinico/queries";
import { getPatient } from "@/modules/pacientes/queries";
import { formatDate } from "../../../format";
import { AnamnesisView } from "../../anamnese/anamnesis-view";
import { AssessmentForm, EMPTY_ASSESSMENT } from "../assessment-form";
import { formatDateTime } from "../assessment-view";

export const metadata: Metadata = { title: "Nova avaliação — TechLab+ Fisio OrtoSport" };

export default async function NovaAvaliacaoPage({ params }: PageProps<"/pacientes/[id]/avaliacoes/nova">) {
  await requirePermission("clinico:gerir");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const base = `/pacientes/${patient.id}/avaliacoes`;
  // A action também recusa; aqui só evitamos exibir um formulário que não pode ser salvo.
  if (patient.status !== "ATIVO") redirect(base);

  const [current, versions] = await Promise.all([getCurrentAnamnesis(patient.id), listAnamnesisVersions(patient.id)]);
  // Sem anamnese não há referência: a lista mostra o atalho para registrar uma.
  if (!current) redirect(base);

  const options = versions.map((version, index) => ({
    id: version.id,
    label: `Anamnese de ${formatDate(version.assessmentDate)}${index === 0 ? " (vigente)" : ""} · salva em ${formatDateTime(version.createdAt)}`,
  }));

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">
          ← Avaliações
        </Link>
        <h2 className="text-xl font-semibold tracking-tight">Nova avaliação inicial</h2>
      </div>

      <details className="rounded-xl border">
        <summary className="cursor-pointer rounded-xl p-4 text-sm font-medium hover:bg-muted/50">
          Consultar a anamnese vigente ({formatDate(current.assessmentDate)})
        </summary>
        <div className="border-t p-4">
          <AnamnesisView anamnesis={current} />
          <p className="pt-3 text-sm text-muted-foreground">
            Outras versões estão no{" "}
            <Link
              href={`/pacientes/${patient.id}/anamnese/historico`}
              target="_blank"
              className="underline underline-offset-4"
            >
              histórico da anamnese
            </Link>
            .
          </p>
        </div>
      </details>

      <AssessmentForm
        action={createAssessment.bind(null, patient.id)}
        initial={{ ...EMPTY_ASSESSMENT, assessmentDate: toLocalDate(new Date()) }}
        anamnesisOptions={options}
        initialAnamnesisId={current.id}
        cancelHref={base}
        submitLabel="Salvar avaliação"
      />
    </div>
  );
}
