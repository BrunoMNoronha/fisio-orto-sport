import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/modules/auth/dal";
import { getAnamnesisVersion, getCurrentAnamnesis } from "@/modules/clinico/queries";
import { getPatient } from "@/modules/pacientes/queries";
import { AnamnesisView } from "../../anamnesis-view";

export const metadata: Metadata = { title: "Versão da anamnese — TechLab+ Fisio OrtoSport" };

// A versão só abre se pertencer ao paciente da URL (a query filtra pelos dois ids).
export default async function VersaoAnamnesePage({
  params,
}: PageProps<"/pacientes/[id]/anamnese/historico/[versaoId]">) {
  await requirePermission("clinico:ler");
  const { id, versaoId } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const [version, current] = await Promise.all([
    getAnamnesisVersion(patient.id, versaoId),
    getCurrentAnamnesis(patient.id),
  ]);
  if (!version) notFound();

  return (
    <div className="w-full max-w-3xl flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href={`/pacientes/${patient.id}/anamnese/historico`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Histórico de versões
        </Link>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Versão da anamnese</h2>
          <Badge variant={current?.id === version.id ? "secondary" : "outline"}>
            {current?.id === version.id ? "Vigente" : "Anterior"}
          </Badge>
        </div>
      </div>
      <AnamnesisView anamnesis={version} />
    </div>
  );
}
