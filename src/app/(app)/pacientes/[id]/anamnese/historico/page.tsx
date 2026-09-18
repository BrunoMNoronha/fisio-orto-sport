import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/modules/auth/dal";
import { listAnamnesisVersions } from "@/modules/clinico/queries";
import { getPatient } from "@/modules/pacientes/queries";
import { formatDate } from "../../../format";

export const metadata: Metadata = { title: "Histórico da anamnese — TechLab+ Fisio OrtoSport" };

// Lista só metadados (data, autor); o conteúdo abre por versão.
export default async function HistoricoAnamnesePage({ params }: PageProps<"/pacientes/[id]/anamnese/historico">) {
  await requirePermission("clinico:ler");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const versions = await listAnamnesisVersions(patient.id);
  const base = `/pacientes/${patient.id}/anamnese`;

  return (
    <div className="w-full max-w-3xl flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">
          ← Anamnese
        </Link>
        <h2 className="text-xl font-semibold tracking-tight">Histórico de versões</h2>
      </div>

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma versão registrada.</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-xl border">
          {versions.map((version, index) => (
            <li key={version.id}>
              <Link
                href={`${base}/historico/${version.id}`}
                className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm hover:bg-muted/50"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">Avaliação em {formatDate(version.assessmentDate)}</span>
                  {index === 0 && <Badge variant="secondary">Vigente</Badge>}
                </span>
                <span className="text-muted-foreground">
                  {version.authorNameSnapshot} · salvo em {version.createdAt.toLocaleString("pt-BR")}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
