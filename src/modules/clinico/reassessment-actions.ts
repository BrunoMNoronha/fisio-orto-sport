"use server";

// Reavaliação: novo evento clínico ligado a um plano ATIVO. Cada action checa `clinico:gerir` no
// servidor. As referências (revisão aplicável na data, avaliação de origem e reavaliação anterior do
// mesmo plano) são calculadas aqui, nunca vindas do formulário, e o conteúdo comparável é congelado
// em referenceSnapshot. A conclusão só documenta: indicar alta não encerra plano, não inativa
// paciente e não mexe na agenda. Correções gravam histórico por campo com motivo. Não há exclusão.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Prisma, TherapyPlanStatus } from "@/generated/prisma/client";
import { AuthorizationError, assertPermission } from "@/modules/auth/dal";
import { fieldErrors, type FieldErrors } from "@/modules/auth/validation";
import {
  EXAM_FIELDS,
  createReassessmentSchema,
  diffReassessment,
  reassessmentFormEntries,
  updateReassessmentSchema,
  type ReferenceSnapshot,
} from "./reassessment-validation";
import { ClinicoRuleError, PATIENT_NOT_FOUND, assertPatientCanReceiveReassessment, signature } from "./rules";
import { isPlausibleId } from "./validation";

export type ReassessmentActionState = { error?: string; fieldErrors?: FieldErrors } | undefined;

type Tx = Prisma.TransactionClient;

const NOT_FOUND = "Reavaliação não encontrada.";
const CONFLICT =
  "Esta reavaliação foi alterada por outra pessoa enquanto você editava. Recarregue a página para ver a versão atual; suas alterações não foram salvas.";

const EXAM_SELECT = {
  inspection: true,
  palpation: true,
  functionalGait: true,
  rangeOfMotion: true,
  muscleStrength: true,
  specialTests: true,
} as const;

class ReassessmentFieldError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

async function guard(): Promise<{ id: string } | ReassessmentActionState> {
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

function failure(error: unknown): ReassessmentActionState {
  if (error instanceof ReassessmentFieldError) return { fieldErrors: { [error.field]: [error.message] } };
  if (error instanceof ClinicoRuleError) return { error: error.message };
  throw error;
}

const brDate = (date: Date) => date.toISOString().slice(0, 10).split("-").reverse().join("/");
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function exam(row: Record<(typeof EXAM_FIELDS)[number], string | null>) {
  return Object.fromEntries(EXAM_FIELDS.map((field) => [field, row[field]])) as Record<
    (typeof EXAM_FIELDS)[number],
    string | null
  >;
}

// Não antes do início do plano (data da revisão 1).
async function assertAfterPlanStart(tx: Tx, planId: string, date: Date) {
  const first = await tx.therapyPlanRevision.findFirst({ where: { planId, number: 1 }, select: { planDate: true } });
  if (!first) throw new ClinicoRuleError("Plano não encontrado.");
  if (date.getTime() < first.planDate.getTime()) {
    throw new ReassessmentFieldError(
      "reassessmentDate",
      `A reavaliação não pode ser anterior ao início do plano (${brDate(first.planDate)}).`,
    );
  }
}

function revalidate(patientId: string) {
  revalidatePath(`/pacientes/${patientId}/reavaliacoes`, "layout");
  revalidatePath(`/pacientes/${patientId}/planos`, "layout");
  revalidatePath(`/pacientes/${patientId}`);
}

// Uso: createReassessment.bind(null, patientId).
export async function createReassessment(
  patientId: string,
  _prev: ReassessmentActionState,
  formData: FormData,
): Promise<ReassessmentActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;
  if (!isPlausibleId(patientId)) return { error: PATIENT_NOT_FOUND };

  const parsed = createReassessmentSchema.safeParse(reassessmentFormEntries(formData, ["planId"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { planId, ...content } = parsed.data;
  const date = content.reassessmentDate;

  let id: string;
  try {
    id = await prisma.$transaction(async (tx) => {
      await assertPatientCanReceiveReassessment(tx, patientId);
      // FOR SHARE: uma revisão ou encerramento concorrente do plano espera este registro.
      const [plan] = await tx.$queryRaw<{ status: TherapyPlanStatus; assessmentId: string }[]>`
        SELECT "status", "assessmentId" FROM "TherapyPlan" WHERE "id" = ${planId} AND "patientId" = ${patientId} FOR SHARE`;
      if (!plan) throw new ReassessmentFieldError("planId", "Selecione um plano deste paciente.");
      if (plan.status !== "ATIVO") {
        throw new ReassessmentFieldError("planId", "Plano encerrado não recebe reavaliação. Reabra o plano antes.");
      }
      await assertAfterPlanStart(tx, planId, date);

      // Revisão aplicável na data: a de maior número com data de plano até a data da reavaliação.
      const revision = await tx.therapyPlanRevision.findFirst({
        where: { planId, planDate: { lte: date } },
        orderBy: { number: "desc" },
        select: { id: true },
      });
      if (!revision) throw new ClinicoRuleError("Plano não encontrado.");

      const assessment = await tx.assessment.findFirst({
        where: { id: plan.assessmentId, patientId },
        select: { id: true, version: true, assessmentDate: true, diagnosis: true, ...EXAM_SELECT },
      });
      if (!assessment) throw new ClinicoRuleError("Avaliação de origem não encontrada.");

      // Reavaliação anterior do mesmo plano (até a data desta), em ordem cronológica estável.
      const previous = await tx.reassessment.findFirst({
        where: { planId, reassessmentDate: { lte: date } },
        orderBy: [{ reassessmentDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          reassessmentDate: true,
          painLimitations: true,
          progressSummary: true,
          goalsStatus: true,
          conclusion: true,
          ...EXAM_SELECT,
        },
      });

      const snapshot: ReferenceSnapshot = {
        assessment: {
          id: assessment.id,
          version: assessment.version,
          assessmentDate: isoDate(assessment.assessmentDate),
          diagnosis: assessment.diagnosis,
          ...exam(assessment),
        },
        previous: previous
          ? {
              id: previous.id,
              reassessmentDate: isoDate(previous.reassessmentDate),
              painLimitations: previous.painLimitations,
              progressSummary: previous.progressSummary,
              goalsStatus: previous.goalsStatus,
              conclusion: previous.conclusion,
              ...exam(previous),
            }
          : null,
      };

      const author = await signature(tx, actor.id);
      const created = await tx.reassessment.create({
        data: {
          ...content,
          patientId,
          planId,
          planRevisionId: revision.id,
          assessmentId: assessment.id,
          previousReassessmentId: previous?.id ?? null,
          referenceSnapshot: snapshot,
          authorId: actor.id,
          authorNameSnapshot: author.name,
          authorCrefitoSnapshot: author.crefito,
        },
        select: { id: true },
      });
      return created.id;
    });
  } catch (error) {
    return failure(error);
  }

  revalidate(patientId);
  redirect(`/pacientes/${patientId}/reavaliacoes/${id}`);
}

// Uso: updateReassessment.bind(null, patientId, reassessmentId).
export async function updateReassessment(
  patientId: string,
  reassessmentId: string,
  _prev: ReassessmentActionState,
  formData: FormData,
): Promise<ReassessmentActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;
  if (!isPlausibleId(patientId) || !isPlausibleId(reassessmentId)) return { error: NOT_FOUND };

  const parsed = updateReassessmentSchema.safeParse(reassessmentFormEntries(formData, ["version", "reason"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { version, reason, ...next } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await assertPatientCanReceiveReassessment(tx, patientId);
      const current = await tx.reassessment.findFirst({
        where: { id: reassessmentId, patientId },
        select: {
          version: true,
          planId: true,
          reassessmentDate: true,
          painLimitations: true,
          progressSummary: true,
          goalsStatus: true,
          goalsJustification: true,
          conclusion: true,
          conclusionSummary: true,
          ...EXAM_SELECT,
          planRevision: { select: { planDate: true } },
        },
      });
      if (!current) throw new ClinicoRuleError(NOT_FOUND);
      if (current.version !== version) throw new ClinicoRuleError(CONFLICT);
      await assertAfterPlanStart(tx, current.planId, next.reassessmentDate);
      // As referências são fixas: a nova data não pode ficar antes da revisão já vinculada.
      if (next.reassessmentDate.getTime() < current.planRevision.planDate.getTime()) {
        throw new ReassessmentFieldError(
          "reassessmentDate",
          `A data não pode ser anterior à revisão do plano de referência (${brDate(current.planRevision.planDate)}).`,
        );
      }

      const changes = diffReassessment(current, next);
      if (changes.length === 0) return;

      const nextVersion = version + 1;
      const updated = await tx.reassessment.updateMany({
        where: { id: reassessmentId, patientId, version },
        data: { ...next, version: nextVersion, updatedAt: new Date() },
      });
      if (updated.count !== 1) throw new ClinicoRuleError(CONFLICT);

      const editor = await signature(tx, actor.id);
      await tx.reassessmentChange.createMany({
        data: changes.map((change) => ({
          ...change,
          reassessmentId,
          version: nextVersion,
          reason,
          editorId: actor.id,
          editorNameSnapshot: editor.name,
          editorCrefitoSnapshot: editor.crefito,
        })),
      });
    });
  } catch (error) {
    return failure(error);
  }

  revalidate(patientId);
  redirect(`/pacientes/${patientId}/reavaliacoes/${reassessmentId}`);
}
