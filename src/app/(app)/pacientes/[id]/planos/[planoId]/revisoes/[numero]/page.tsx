import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/modules/auth/dal";
import { getPlan, getPlanRevision } from "@/modules/clinico/plan-queries";
import { revisionNumberSchema } from "@/modules/clinico/plan-validation";
import { getPatient } from "@/modules/pacientes/queries";
import { PlanRevisionView } from "../../../plan-view";

export const metadata: Metadata = { title: "Revisão do plano terapêutico — TechLab+ Fisio OrtoSport" };

// Conteúdo congelado de uma revisão específica (a referência que sessões futuras vão usar).
export default async function RevisaoPlanoPage({
  params,
}: PageProps<"/pacientes/[id]/planos/[planoId]/revisoes/[numero]">) {
  await requirePermission("clinico:ler");
  const { id, planoId, numero } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const number = revisionNumberSchema.safeParse(numero);
  if (!number.success) notFound();
  const [plan, revision] = await Promise.all([
    getPlan(patient.id, planoId),
    getPlanRevision(patient.id, planoId, number.data),
  ]);
  if (!plan || !revision) notFound();

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={`/pacientes/${patient.id}/planos/${plan.id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Plano terapêutico
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">Revisão {revision.number} do plano</h2>
          {revision.number === plan.currentRevision ? (
            <Badge variant="secondary">Vigente</Badge>
          ) : (
            <Badge variant="outline">Substituída</Badge>
          )}
        </div>
      </div>
      <PlanRevisionView revision={revision} />
    </div>
  );
}
