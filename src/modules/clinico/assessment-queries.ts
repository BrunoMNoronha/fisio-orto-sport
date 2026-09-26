import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { ASSESSMENT_PAGE_SIZE } from "./assessment-validation";
import { isPlausibleId } from "./validation";

// Toda leitura exige `clinico:ler` aqui, mesmo que a página já tenha checado, e toda consulta
// filtra por patientId: uma avaliação nunca é lida fora do paciente da URL.

// Ordem determinística: data clínica mais recente; no mesmo dia, o registro mais recente; por fim o id.
const NEWEST_FIRST = [{ assessmentDate: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];

// Listagem: só metadados, sem conteúdo clínico.
export const ASSESSMENT_LIST_SELECT = {
  id: true,
  assessmentDate: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  authorNameSnapshot: true,
} as const;

export const ASSESSMENT_DETAIL_SELECT = {
  id: true,
  patientId: true,
  anamnesisId: true,
  assessmentDate: true,
  inspection: true,
  palpation: true,
  functionalGait: true,
  rangeOfMotion: true,
  muscleStrength: true,
  specialTests: true,
  diagnosis: true,
  therapeuticGoals: true,
  clinicalNotes: true,
  version: true,
  authorNameSnapshot: true,
  authorCrefitoSnapshot: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const ASSESSMENT_CHANGE_SELECT = {
  id: true,
  version: true,
  field: true,
  previousValue: true,
  newValue: true,
  editorNameSnapshot: true,
  editorCrefitoSnapshot: true,
  changedAt: true,
} as const;

export async function listAssessments(patientId: string, page: number) {
  await requirePermission("clinico:ler");
  const empty = { items: [], total: 0, page: 1, pageSize: ASSESSMENT_PAGE_SIZE, pageCount: 1 };
  if (!isPlausibleId(patientId)) return empty;
  const where = { patientId };
  const [items, total] = await prisma.$transaction([
    prisma.assessment.findMany({
      where,
      orderBy: NEWEST_FIRST,
      skip: (page - 1) * ASSESSMENT_PAGE_SIZE,
      take: ASSESSMENT_PAGE_SIZE,
      select: ASSESSMENT_LIST_SELECT,
    }),
    prisma.assessment.count({ where }),
  ]);
  return {
    items,
    total,
    page,
    pageSize: ASSESSMENT_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / ASSESSMENT_PAGE_SIZE)),
  };
}

export async function getAssessment(patientId: string, assessmentId: string) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId) || !isPlausibleId(assessmentId)) return null;
  return prisma.assessment.findFirst({
    where: { id: assessmentId, patientId },
    select: ASSESSMENT_DETAIL_SELECT,
  });
}

// Histórico de edições, da mais recente para a mais antiga. O filtro pelo paciente passa pela
// avaliação, para que um id trocado não exponha o histórico de outro paciente.
export async function listAssessmentChanges(patientId: string, assessmentId: string) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId) || !isPlausibleId(assessmentId)) return [];
  return prisma.assessmentChange.findMany({
    where: { assessmentId, assessment: { patientId } },
    orderBy: [{ version: "desc" }, { id: "asc" }],
    select: ASSESSMENT_CHANGE_SELECT,
  });
}

export type AssessmentListItem = Awaited<ReturnType<typeof listAssessments>>["items"][number];
export type AssessmentDetail = NonNullable<Awaited<ReturnType<typeof getAssessment>>>;
export type AssessmentChangeItem = Awaited<ReturnType<typeof listAssessmentChanges>>[number];
