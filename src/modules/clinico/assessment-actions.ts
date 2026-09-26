"use server";

// Avaliação fisioterapêutica inicial. Cada action checa `clinico:gerir` no servidor, independentemente
// da UI. A avaliação é editável (decisão D2): cada edição grava, na mesma transação, uma linha de
// AssessmentChange por campo alterado, com o valor anterior e a autoria. Não há exclusão.
// Mensagens de erro são genéricas e nunca ecoam o conteúdo enviado.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AuthorizationError, assertPermission } from "@/modules/auth/dal";
import { fieldErrors, type FieldErrors } from "@/modules/auth/validation";
import {
  assessmentFormEntries,
  createAssessmentSchema,
  diffAssessment,
  updateAssessmentSchema,
} from "./assessment-validation";
import { ClinicoRuleError, PATIENT_NOT_FOUND, assertPatientCanReceiveAssessment, signature } from "./rules";
import { isPlausibleId } from "./validation";

export type AssessmentActionState = { error?: string; fieldErrors?: FieldErrors } | undefined;

const ASSESSMENT_NOT_FOUND = "Avaliação não encontrada.";
const ASSESSMENT_CONFLICT =
  "Esta avaliação foi alterada por outra pessoa enquanto você editava. Recarregue a página para ver a versão atual; suas alterações não foram salvas.";

// Erro associado a um campo do formulário (ex.: anamnese de outro paciente).
class AssessmentFieldError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

async function guard(): Promise<{ id: string } | AssessmentActionState> {
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

function failure(error: unknown): AssessmentActionState {
  if (error instanceof AssessmentFieldError) return { fieldErrors: { [error.field]: [error.message] } };
  if (error instanceof ClinicoRuleError) return { error: error.message };
  throw error;
}

function revalidate(patientId: string) {
  revalidatePath(`/pacientes/${patientId}/avaliacoes`, "layout");
  revalidatePath(`/pacientes/${patientId}`);
}

// Uso: createAssessment.bind(null, patientId). O patientId vem do cliente e é revalidado aqui.
export async function createAssessment(
  patientId: string,
  _prev: AssessmentActionState,
  formData: FormData,
): Promise<AssessmentActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;
  if (!isPlausibleId(patientId)) return { error: PATIENT_NOT_FOUND };

  const parsed = createAssessmentSchema.safeParse(assessmentFormEntries(formData, ["anamnesisId"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  let id: string;
  try {
    id = await prisma.$transaction(async (tx) => {
      await assertPatientCanReceiveAssessment(tx, patientId);
      // A FK composta também garante isto no banco; aqui a recusa vira mensagem no campo.
      const anamnesis = await tx.anamnesis.findFirst({
        where: { id: parsed.data.anamnesisId, patientId },
        select: { id: true },
      });
      if (!anamnesis) throw new AssessmentFieldError("anamnesisId", "Selecione uma anamnese deste paciente.");

      const author = await signature(tx, actor.id);
      const created = await tx.assessment.create({
        data: {
          ...parsed.data,
          patientId,
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
  redirect(`/pacientes/${patientId}/avaliacoes/${id}`);
}

// Uso: updateAssessment.bind(null, patientId, assessmentId).
export async function updateAssessment(
  patientId: string,
  assessmentId: string,
  _prev: AssessmentActionState,
  formData: FormData,
): Promise<AssessmentActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;
  if (!isPlausibleId(patientId) || !isPlausibleId(assessmentId)) return { error: ASSESSMENT_NOT_FOUND };

  const parsed = updateAssessmentSchema.safeParse(assessmentFormEntries(formData, ["version"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { version, ...next } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await assertPatientCanReceiveAssessment(tx, patientId);
      // Sempre filtrado pelo paciente da URL: id de avaliação alheia responde "não encontrada".
      const current = await tx.assessment.findFirst({
        where: { id: assessmentId, patientId },
        select: {
          version: true,
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
        },
      });
      if (!current) throw new ClinicoRuleError(ASSESSMENT_NOT_FOUND);
      if (current.version !== version) throw new ClinicoRuleError(ASSESSMENT_CONFLICT);

      const changes = diffAssessment(current, next);
      if (changes.length === 0) return;

      // Checagem otimista no próprio UPDATE: se outra edição gravou antes, nada muda e a
      // transação é desfeita (o histórico só é gravado junto com a alteração).
      const nextVersion = version + 1;
      const updated = await tx.assessment.updateMany({
        where: { id: assessmentId, patientId, version },
        data: { ...next, version: nextVersion, updatedAt: new Date() },
      });
      if (updated.count !== 1) throw new ClinicoRuleError(ASSESSMENT_CONFLICT);

      const editor = await signature(tx, actor.id);
      await tx.assessmentChange.createMany({
        data: changes.map((change) => ({
          ...change,
          assessmentId,
          version: nextVersion,
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
  redirect(`/pacientes/${patientId}/avaliacoes/${assessmentId}`);
}
