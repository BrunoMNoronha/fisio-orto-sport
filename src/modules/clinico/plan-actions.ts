"use server";

// Plano terapêutico. Cada action checa `clinico:gerir` no servidor, independentemente da UI.
// O conteúdo vive em revisões imutáveis: criar grava a revisão 1 (INICIAL); revisar grava a
// seguinte, com tipo e motivo, e nunca altera as anteriores. Encerrar e reabrir registram o
// motivo em TherapyPlanStatusChange. Não há exclusão. Mensagens nunca ecoam o conteúdo enviado.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AuthorizationError, assertPermission } from "@/modules/auth/dal";
import { fieldErrors, type FieldErrors } from "@/modules/auth/validation";
import {
  PLAN_FIELDS,
  changePlanStatusSchema,
  createPlanSchema,
  planFormEntries,
  revisePlanSchema,
  samePlanContent,
  type PlanContent,
} from "./plan-validation";
import { ClinicoRuleError, PATIENT_NOT_FOUND, assertPatientCanReceivePlan, signature } from "./rules";
import { isPlausibleId } from "./validation";

export type PlanActionState = { ok?: boolean; message?: string; error?: string; fieldErrors?: FieldErrors } | undefined;

const PLAN_NOT_FOUND = "Plano não encontrado.";
const PLAN_CONFLICT =
  "Este plano foi revisado ou mudou de estado enquanto você editava. Recarregue a página para ver a revisão vigente; suas alterações não foram salvas.";
const PLAN_CLOSED = "Plano encerrado não recebe revisão. Reabra o plano antes de revisar.";

const CONTENT_SELECT = {
  planDate: true,
  goals: true,
  conduct: true,
  techniques: true,
  exercises: true,
  plannedSessions: true,
  frequency: true,
  reassessment: true,
  notes: true,
} as const;

class PlanFieldError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

async function guard(): Promise<{ id: string } | PlanActionState> {
  try {
    const actor = await assertPermission("clinico:gerir");
    return { id: actor.id };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: "Acesso negado." };
    throw error;
  }
}

function isActor(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && "id" in value;
}

function failure(error: unknown): PlanActionState {
  if (error instanceof PlanFieldError) return { fieldErrors: { [error.field]: [error.message] } };
  if (error instanceof ClinicoRuleError) return { error: error.message };
  throw error;
}

// Consistência temporal: o plano (e cada revisão) não pode ter data clínica anterior à avaliação de origem.
function assertNotBeforeAssessment(planDate: Date, assessmentDate: Date) {
  if (planDate.getTime() < assessmentDate.getTime()) {
    const label = assessmentDate.toISOString().slice(0, 10).split("-").reverse().join("/");
    throw new PlanFieldError("planDate", `A data do plano não pode ser anterior à data da avaliação de origem (${label}).`);
  }
}

function content(data: PlanContent): PlanContent {
  return Object.fromEntries(PLAN_FIELDS.map((field) => [field, data[field]])) as PlanContent;
}

function revalidate(patientId: string) {
  revalidatePath(`/pacientes/${patientId}/planos`, "layout");
  revalidatePath(`/pacientes/${patientId}`);
}

// Uso: createPlan.bind(null, patientId).
export async function createPlan(
  patientId: string,
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;
  if (!isPlausibleId(patientId)) return { error: PATIENT_NOT_FOUND };

  const parsed = createPlanSchema.safeParse(planFormEntries(formData, ["assessmentId"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { assessmentId, ...data } = parsed.data;

  let id: string;
  try {
    id = await prisma.$transaction(async (tx) => {
      await assertPatientCanReceivePlan(tx, patientId);
      // A FK composta também garante isto no banco; aqui a recusa vira mensagem no campo.
      const assessment = await tx.assessment.findFirst({
        where: { id: assessmentId, patientId },
        select: { version: true, assessmentDate: true },
      });
      if (!assessment) throw new PlanFieldError("assessmentId", "Selecione uma avaliação deste paciente.");
      assertNotBeforeAssessment(data.planDate, assessment.assessmentDate);

      const author = await signature(tx, actor.id);
      const authorship = {
        authorId: actor.id,
        authorNameSnapshot: author.name,
        authorCrefitoSnapshot: author.crefito,
      };
      const created = await tx.therapyPlan.create({
        data: {
          patientId,
          assessmentId,
          // Versão exata da avaliação usada: edições posteriores da avaliação não mudam a origem.
          assessmentVersion: assessment.version,
          ...authorship,
          revisions: { create: { number: 1, kind: "INICIAL", ...content(data), ...authorship } },
        },
        select: { id: true },
      });
      return created.id;
    });
  } catch (error) {
    return failure(error);
  }

  revalidate(patientId);
  redirect(`/pacientes/${patientId}/planos/${id}`);
}

// Uso: revisePlan.bind(null, patientId, planId).
export async function revisePlan(
  patientId: string,
  planId: string,
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;
  if (!isPlausibleId(patientId) || !isPlausibleId(planId)) return { error: PLAN_NOT_FOUND };

  const parsed = revisePlanSchema.safeParse(planFormEntries(formData, ["kind", "reason", "baseRevision"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { kind, reason, baseRevision, ...data } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await assertPatientCanReceivePlan(tx, patientId);
      // Sempre filtrado pelo paciente da URL: id de plano alheio responde "não encontrado".
      const plan = await tx.therapyPlan.findFirst({
        where: { id: planId, patientId },
        select: {
          status: true,
          currentRevision: true,
          assessment: { select: { assessmentDate: true } },
          revisions: { orderBy: { number: "desc" }, take: 1, select: CONTENT_SELECT },
        },
      });
      if (!plan) throw new ClinicoRuleError(PLAN_NOT_FOUND);
      if (plan.status !== "ATIVO") throw new ClinicoRuleError(PLAN_CLOSED);
      if (plan.currentRevision !== baseRevision) throw new ClinicoRuleError(PLAN_CONFLICT);
      assertNotBeforeAssessment(data.planDate, plan.assessment.assessmentDate);
      const current = plan.revisions[0];
      if (current && samePlanContent(current, data)) {
        throw new ClinicoRuleError("Nenhuma alteração em relação à revisão vigente. Altere algum campo para revisar.");
      }

      // Checagem otimista no próprio UPDATE: se outra revisão (ou encerramento) gravou antes,
      // nada muda e a transação é desfeita. A unicidade (planId, number) é a segunda barreira.
      const number = baseRevision + 1;
      const updated = await tx.therapyPlan.updateMany({
        where: { id: planId, patientId, currentRevision: baseRevision, status: "ATIVO" },
        data: { currentRevision: number, updatedAt: new Date() },
      });
      if (updated.count !== 1) throw new ClinicoRuleError(PLAN_CONFLICT);

      const author = await signature(tx, actor.id);
      await tx.therapyPlanRevision.create({
        data: {
          planId,
          number,
          kind,
          reason,
          ...content(data),
          authorId: actor.id,
          authorNameSnapshot: author.name,
          authorCrefitoSnapshot: author.crefito,
        },
        select: { id: true },
      });
    });
  } catch (error) {
    return failure(error);
  }

  revalidate(patientId);
  redirect(`/pacientes/${patientId}/planos/${planId}`);
}

// Encerrar (ATIVO → ENCERRADO) ou reabrir (ENCERRADO → ATIVO), com motivo. Encerrar não é alta.
// Uso: changePlanStatus.bind(null, patientId, planId).
export async function changePlanStatus(
  patientId: string,
  planId: string,
  _prev: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;
  if (!isPlausibleId(patientId) || !isPlausibleId(planId)) return { error: PLAN_NOT_FOUND };

  const parsed = changePlanStatusSchema.safeParse({
    toStatus: formData.get("toStatus") ?? undefined,
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { toStatus, reason } = parsed.data;
  const fromStatus = toStatus === "ATIVO" ? "ENCERRADO" : "ATIVO";

  try {
    await prisma.$transaction(async (tx) => {
      await assertPatientCanReceivePlan(tx, patientId);
      const updated = await tx.therapyPlan.updateMany({
        where: { id: planId, patientId, status: fromStatus },
        data: { status: toStatus, updatedAt: new Date() },
      });
      if (updated.count !== 1) {
        const exists = await tx.therapyPlan.findFirst({ where: { id: planId, patientId }, select: { id: true } });
        throw new ClinicoRuleError(exists ? PLAN_CONFLICT : PLAN_NOT_FOUND);
      }
      const author = await signature(tx, actor.id);
      await tx.therapyPlanStatusChange.create({
        data: {
          planId,
          fromStatus,
          toStatus,
          reason,
          authorId: actor.id,
          authorNameSnapshot: author.name,
          authorCrefitoSnapshot: author.crefito,
        },
        select: { id: true },
      });
    });
  } catch (error) {
    return failure(error);
  }

  revalidate(patientId);
  return { ok: true, message: toStatus === "ENCERRADO" ? "Plano encerrado." : "Plano reaberto." };
}
