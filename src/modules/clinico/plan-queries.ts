import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { PLAN_PAGE_SIZE } from "./plan-validation";
import { isPlausibleId } from "./validation";

// Toda leitura exige `clinico:ler` aqui e filtra pelo paciente da URL (planos alheios não vazam).

// Ordem determinística: plano criado mais recentemente primeiro; desempate pelo id.
const NEWEST_FIRST = [{ createdAt: "desc" as const }, { id: "desc" as const }];

// A revisão vigente é sempre a de maior número (= currentRevision).
const LATEST_REVISION = { orderBy: { number: "desc" as const }, take: 1 };

export const PLAN_REVISION_SELECT = {
  id: true,
  number: true,
  kind: true,
  reason: true,
  planDate: true,
  goals: true,
  conduct: true,
  techniques: true,
  exercises: true,
  plannedSessions: true,
  frequency: true,
  reassessment: true,
  notes: true,
  authorNameSnapshot: true,
  authorCrefitoSnapshot: true,
  createdAt: true,
} as const;

const ORIGIN_SELECT = { id: true, assessmentDate: true, version: true } as const;

// Listagem: só metadados (estado, datas, revisão vigente, autoria), sem conteúdo clínico.
export async function listPlans(patientId: string, page: number) {
  await requirePermission("clinico:ler");
  const empty = { items: [], total: 0, page: 1, pageSize: PLAN_PAGE_SIZE, pageCount: 1 };
  if (!isPlausibleId(patientId)) return empty;
  const where = { patientId };
  const [items, total] = await prisma.$transaction([
    prisma.therapyPlan.findMany({
      where,
      orderBy: NEWEST_FIRST,
      skip: (page - 1) * PLAN_PAGE_SIZE,
      take: PLAN_PAGE_SIZE,
      select: {
        id: true,
        status: true,
        currentRevision: true,
        createdAt: true,
        authorNameSnapshot: true,
        assessment: { select: { assessmentDate: true } },
        revisions: { ...LATEST_REVISION, select: { planDate: true } },
      },
    }),
    prisma.therapyPlan.count({ where }),
  ]);
  return {
    items,
    total,
    page,
    pageSize: PLAN_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PLAN_PAGE_SIZE)),
  };
}

// Plano com origem (e a versão atual da avaliação, para indicar se ela mudou depois) e revisão vigente.
export async function getPlan(patientId: string, planId: string) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId) || !isPlausibleId(planId)) return null;
  const plan = await prisma.therapyPlan.findFirst({
    where: { id: planId, patientId },
    select: {
      id: true,
      status: true,
      currentRevision: true,
      assessmentVersion: true,
      authorNameSnapshot: true,
      authorCrefitoSnapshot: true,
      createdAt: true,
      updatedAt: true,
      assessment: { select: ORIGIN_SELECT },
      revisions: { ...LATEST_REVISION, select: PLAN_REVISION_SELECT },
    },
  });
  if (!plan || plan.revisions.length === 0) return null;
  const { revisions, ...rest } = plan;
  return { ...rest, current: revisions[0] };
}

export async function getPlanRevision(patientId: string, planId: string, number: number) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId) || !isPlausibleId(planId) || !Number.isInteger(number) || number < 1) return null;
  return prisma.therapyPlanRevision.findFirst({
    where: { planId, number, plan: { patientId } },
    select: PLAN_REVISION_SELECT,
  });
}

// Histórico de revisões (metadados), da mais recente para a mais antiga.
export async function listPlanRevisions(patientId: string, planId: string) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId) || !isPlausibleId(planId)) return [];
  return prisma.therapyPlanRevision.findMany({
    where: { planId, plan: { patientId } },
    orderBy: { number: "desc" },
    select: {
      id: true,
      number: true,
      kind: true,
      reason: true,
      planDate: true,
      authorNameSnapshot: true,
      authorCrefitoSnapshot: true,
      createdAt: true,
    },
  });
}

export async function listPlanStatusChanges(patientId: string, planId: string) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId) || !isPlausibleId(planId)) return [];
  return prisma.therapyPlanStatusChange.findMany({
    where: { planId, plan: { patientId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      reason: true,
      authorNameSnapshot: true,
      authorCrefitoSnapshot: true,
      createdAt: true,
    },
  });
}

// Há plano ATIVO? (decide se a tela de sessões oferece o registro.)
export async function countActivePlans(patientId: string) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId)) return 0;
  return prisma.therapyPlan.count({ where: { patientId, status: "ATIVO" } });
}

// Avaliações que podem originar um plano, com diagnóstico e objetivos de referência para o formulário.
export async function listPlanOriginOptions(patientId: string) {
  await requirePermission("clinico:gerir");
  if (!isPlausibleId(patientId)) return [];
  return prisma.assessment.findMany({
    where: { patientId },
    orderBy: [{ assessmentDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true, assessmentDate: true, version: true, diagnosis: true, therapeuticGoals: true },
  });
}

export type PlanListItem = Awaited<ReturnType<typeof listPlans>>["items"][number];
export type PlanDetail = NonNullable<Awaited<ReturnType<typeof getPlan>>>;
export type PlanRevisionDetail = NonNullable<Awaited<ReturnType<typeof getPlanRevision>>>;
export type PlanRevisionItem = Awaited<ReturnType<typeof listPlanRevisions>>[number];
export type PlanStatusChangeItem = Awaited<ReturnType<typeof listPlanStatusChanges>>[number];
export type PlanOriginOption = Awaited<ReturnType<typeof listPlanOriginOptions>>[number];
