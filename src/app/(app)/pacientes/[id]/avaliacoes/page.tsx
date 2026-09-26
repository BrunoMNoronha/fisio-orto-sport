import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { listAssessments } from "@/modules/clinico/assessment-queries";
import { assessmentPageSchema } from "@/modules/clinico/assessment-validation";
import { getCurrentAnamnesis } from "@/modules/clinico/queries";
import { getPatient } from "@/modules/pacientes/queries";
import { firstParam } from "@/modules/pacientes/validation";
import { formatDate } from "../../format";
import { formatDateTime } from "./assessment-view";

// Metadata genérica: nunca inclui nome do paciente nem conteúdo clínico.
export const metadata: Metadata = { title: "Avaliações — TechLab+ Fisio OrtoSport" };

// Lista só metadados (data clínica, autor, registro); o conteúdo abre no detalhe.
export default async function AvaliacoesPage({ params, searchParams }: PageProps<"/pacientes/[id]/avaliacoes">) {
  const actor = await requirePermission("clinico:ler");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const requestedPage = assessmentPageSchema.parse(firstParam((await searchParams).pagina));
  const [{ items, total, page, pageCount }, anamnesis] = await Promise.all([
    listAssessments(patient.id, requestedPage),
    getCurrentAnamnesis(patient.id),
  ]);
  const active = patient.status === "ATIVO";
  const canManage = can(actor.role, "clinico:gerir") && active;
  const base = `/pacientes/${patient.id}/avaliacoes`;
  const pageHref = (target: number) => (target <= 1 ? base : `${base}?pagina=${target}`);

  return (
    <div className="w-full max-w-3xl flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Avaliações</h2>
        {canManage && anamnesis && (
          <Link href={`${base}/nova`} className={buttonVariants()}>
            Nova avaliação inicial
          </Link>
        )}
      </div>

      {!active && (
        <Alert>
          <AlertDescription>
            Paciente inativo: as avaliações podem ser consultadas, mas novas avaliações e edições só podem ser feitas
            após a reativação do cadastro.
          </AlertDescription>
        </Alert>
      )}

      {canManage && !anamnesis && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <p className="text-sm text-muted-foreground">
            A avaliação inicial usa uma anamnese como referência. Registre a anamnese deste paciente primeiro.
          </p>
          <Link href={`/pacientes/${patient.id}/anamnese/nova`} className={buttonVariants({ variant: "outline" })}>
            Registrar anamnese
          </Link>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {total === 0 ? "Nenhuma avaliação registrada para este paciente." : "Nenhuma avaliação nesta página."}
        </p>
      ) : (
        <ol className="flex flex-col divide-y rounded-xl border">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`${base}/${item.id}`}
                className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm hover:bg-muted/50"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">Avaliação inicial de {formatDate(item.assessmentDate)}</span>
                  {item.version > 1 && <Badge variant="outline">Editada</Badge>}
                </span>
                <span className="text-muted-foreground">
                  {item.authorNameSnapshot} · registrada em {formatDateTime(item.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {total > 0 && (
        <nav aria-label="Paginação das avaliações" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "avaliação" : "avaliações"} · página {Math.min(page, pageCount)} de {pageCount}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageHref(Math.min(page - 1, pageCount))}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Anterior
              </Link>
            )}
            {page < pageCount && (
              <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Próxima
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
