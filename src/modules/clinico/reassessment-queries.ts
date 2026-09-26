import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { REASSESSMENT_PAGE_SIZE, type ReferenceSnapshot } from "./reassessment-validation";
import { isPlausibleId } from "./validation";

// Toda leitura exige `clinico:ler` aqui e filtra pelo paciente da URL (reavaliações alheias não vazam).

// Ordem determinística: data clínica mais recente; depois o registro; por fim o id.
const NEWEST_FIRST = [{ reassessmentDate: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];

// Listagem: metadados, conclusão e a pendência de ajuste (sem o conteúdo clínico detalhado).
export async function listReassessments(patientId: string, page: number) {
  await requirePermission("clinico:ler");
  const empty = { items: [], total: 0, page: 1, pageSize: REASSESSMENT_PAGE_SIZE, pageCount: 1 };
  if (!isPlausibleId(patientId)) return empty;
  const where = { patientId };
  const [rows, total] = await prisma.$transaction([
    prisma.reassessment.findMany({
      where,
      orderBy: NEWEST_FIRST,
      skip: (page - 1) * REASSESSMENT_PAGE_SIZE,
      take: REASSESSMENT_PAGE_SIZE,
      select: {
        id: true,
        planId: true,
        reassessmentDate: true,
        conclusion: true,
        goalsStatus: true,
        version: true,
        authorNameSnapshot: true,
        createdAt: true,
        resultingRevision: { select: { number: true } },
      },
    }),
    prisma.reassessment.count({ where }),
  ]);
  const items = rows.map(({ resultingRevision, ...row }) => ({
    ...row,
    resultingRevisionNumber: resultingRevision?.number ?? null,
    adjustmentPending: row.conclusion === "AJUSTE_PLANO" && !resultingRevision,
  }));
  return {
    items,
    total,
    page,
    pageSize: REASSESSMENT_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / REASSESSMENT_PAGE_SIZE)),
  };
}

export async function getReassessment(patientId: string, reassessmentId: string) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId) || !isPlausibleId(reassessmentId)) return null;
  const row = await prisma.reassessment.findFirst({
    where: { id: reassessmentId, patientId },
    select: {
      id: true,
      planId: true,
      assessmentId: true,
      previousReassessmentId: true,
      referenceSnapshot: true,
      reassessmentDate: true,
      inspection: true,
      palpation: true,
      functionalGait: true,
      rangeOfMotion: true,
      muscleStrength: true,
      specialTests: true,
      painLimitations: true,
      progressSummary: true,
      goalsStatus: true,
      goalsJustification: true,
      conclusion: true,
      conclusionSummary: true,
      version: true,
      authorNameSnapshot: true,
      authorCrefitoSnapshot: true,
      createdAt: true,
      updatedAt: true,
      // A revisão do plano de referência (aplicável na data), com os objetivos avaliados.
      planRevision: { select: { number: true, planDate: true, goals: true } },
      plan: { select: { status: true, currentRevision: true } },
      resultingRevision: { select: { number: true, planDate: true } },
    },
  });
  if (!row) return null;
  const { referenceSnapshot, ...rest } = row;
  return {
    ...rest,
    reference: referenceSnapshot as unknown as ReferenceSnapshot,
    adjustmentPending: row.conclusion === "AJUSTE_PLANO" && !row.resultingRevision,
  };
}

export async function listReassessmentChanges(patientId: string, reassessmentId: string) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId) || !isPlausibleId(reassessmentId)) return [];
  return prisma.reassessmentChange.findMany({
    where: { reassessmentId, reassessment: { patientId } },
    orderBy: [{ version: "desc" }, { id: "asc" }],
    select: {
      id: true,
      version: true,
      field: true,
      previousValue: true,
      newValue: true,
      reason: true,
      editorNameSnapshot: true,
      editorCrefitoSnapshot: true,
      changedAt: true,
    },
  });
}

// Planos ATIVOS para reavaliar, com a data de início, os objetivos da revisão vigente e a contagem
// de sessões válidas (contexto para o formulário).
export async function listReassessmentPlanOptions(patientId: string) {
  await requirePermission("clinico:gerir");
  if (!isPlausibleId(patientId)) return [];
  const plans = await prisma.therapyPlan.findMany({
    where: { patientId, status: "ATIVO" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      currentRevision: true,
      assessment: { select: { assessmentDate: true, diagnosis: true } },
      revisions: { orderBy: { number: "desc" }, take: 1, select: { number: true, planDate: true, goals: true } },
      _count: { select: { treatmentSessions: { where: { status: "VALIDO" } } } },
    },
  });
  return plans.map(({ _count, revisions, ...plan }) => ({
    ...plan,
    current: revisions[0],
    validSessions: _count.treatmentSessions,
  }));
}

export type ReassessmentListItem = Awaited<ReturnType<typeof listReassessments>>["items"][number];
export type ReassessmentDetail = NonNullable<Awaited<ReturnType<typeof getReassessment>>>;
export type ReassessmentChangeItem = Awaited<ReturnType<typeof listReassessmentChanges>>[number];
export type ReassessmentPlanOption = Awaited<ReturnType<typeof listReassessmentPlanOptions>>[number];
