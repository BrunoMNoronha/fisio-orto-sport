import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { SESSION_PAGE_SIZE } from "./session-validation";
import { isPlausibleId } from "./validation";

// Toda leitura exige `clinico:ler` aqui e filtra pelo paciente da URL (atendimentos alheios não vazam).

// Ordem cronológica determinística: momento clínico mais recente; depois o lançamento; por fim o id.
const NEWEST_FIRST = [{ occurredAt: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];

const REVISION_REF = { select: { number: true, planDate: true, plannedSessions: true } } as const;

// Histórico de atendimentos (evolução incluída: é o histórico clínico, protegido por `clinico:ler`).
export async function listSessions(patientId: string, page: number) {
  await requirePermission("clinico:ler");
  const empty = { items: [], total: 0, page: 1, pageSize: SESSION_PAGE_SIZE, pageCount: 1 };
  if (!isPlausibleId(patientId)) return empty;
  const where = { patientId };
  const [items, total] = await prisma.$transaction([
    prisma.treatmentSession.findMany({
      where,
      orderBy: NEWEST_FIRST,
      skip: (page - 1) * SESSION_PAGE_SIZE,
      take: SESSION_PAGE_SIZE,
      select: {
        id: true,
        occurredAt: true,
        status: true,
        version: true,
        evolution: true,
        professionalNameSnapshot: true,
        createdAt: true,
        planId: true,
        planRevision: { select: { number: true } },
      },
    }),
    prisma.treatmentSession.count({ where }),
  ]);
  return {
    items,
    total,
    page,
    pageSize: SESSION_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / SESSION_PAGE_SIZE)),
  };
}

export async function getSession(patientId: string, sessionId: string) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId) || !isPlausibleId(sessionId)) return null;
  return prisma.treatmentSession.findFirst({
    where: { id: sessionId, patientId },
    select: {
      id: true,
      planId: true,
      occurredAt: true,
      professionalId: true,
      professionalNameSnapshot: true,
      professionalCrefitoSnapshot: true,
      techniques: true,
      exercises: true,
      observations: true,
      evolution: true,
      nextSteps: true,
      status: true,
      invalidationReason: true,
      invalidatedAt: true,
      invalidatedByNameSnapshot: true,
      version: true,
      authorNameSnapshot: true,
      authorCrefitoSnapshot: true,
      createdAt: true,
      updatedAt: true,
      // A revisão exata aplicada (não a vigente de hoje).
      planRevision: REVISION_REF,
      plan: { select: { status: true, currentRevision: true } },
    },
  });
}

export async function listSessionChanges(patientId: string, sessionId: string) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId) || !isPlausibleId(sessionId)) return [];
  return prisma.treatmentSessionChange.findMany({
    where: { sessionId, session: { patientId } },
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

// Atendimentos realizados de um plano: só os VÁLIDOS contam (correções não somam; invalidados saem).
export async function countValidSessions(patientId: string, planId: string) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId) || !isPlausibleId(planId)) return 0;
  return prisma.treatmentSession.count({ where: { patientId, planId, status: "VALIDO" } });
}

// Últimas sessões válidas de um plano (contexto da reavaliação): momento e evolução, mais recente primeiro.
export async function listRecentPlanSessions(patientId: string, planId: string, take = 5) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId) || !isPlausibleId(planId)) return [];
  return prisma.treatmentSession.findMany({
    where: { patientId, planId, status: "VALIDO" },
    orderBy: NEWEST_FIRST,
    take,
    select: { id: true, occurredAt: true, evolution: true, professionalNameSnapshot: true },
  });
}

// Planos ATIVOS do paciente, com as revisões (para escolher a aplicada) e a contagem de realizados.
export async function listSessionPlanOptions(patientId: string) {
  await requirePermission("clinico:gerir");
  if (!isPlausibleId(patientId)) return [];
  const plans = await prisma.therapyPlan.findMany({
    where: { patientId, status: "ATIVO" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      currentRevision: true,
      revisions: { orderBy: { number: "desc" }, select: { id: true, number: true, planDate: true, kind: true, plannedSessions: true } },
      _count: { select: { treatmentSessions: { where: { status: "VALIDO" } } } },
    },
  });
  return plans.map(({ _count, ...plan }) => ({ ...plan, validSessions: _count.treatmentSessions }));
}

// Fisioterapeutas que podem ser responsáveis (inativos também, para lançamento retroativo).
export async function listProfessionalOptions() {
  await requirePermission("clinico:gerir");
  return prisma.user.findMany({
    where: { role: "FISIOTERAPEUTA" },
    orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, crefito: true, active: true },
  });
}

export type SessionListItem = Awaited<ReturnType<typeof listSessions>>["items"][number];
export type SessionDetail = NonNullable<Awaited<ReturnType<typeof getSession>>>;
export type SessionChangeItem = Awaited<ReturnType<typeof listSessionChanges>>[number];
export type SessionPlanOption = Awaited<ReturnType<typeof listSessionPlanOptions>>[number];
export type ProfessionalOption = Awaited<ReturnType<typeof listProfessionalOptions>>[number];
export type RecentPlanSession = Awaited<ReturnType<typeof listRecentPlanSessions>>[number];
