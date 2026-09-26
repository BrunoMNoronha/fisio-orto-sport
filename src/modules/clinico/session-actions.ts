"use server";

// Atendimento clínico (sessão de fisioterapia) com evolução. Cada action checa `clinico:gerir` no
// servidor. O responsável é um FISIOTERAPEUTA (o próprio, quando quem registra é fisioterapeuta);
// o autor do lançamento vem da sessão de login. Correções gravam histórico por campo com motivo;
// invalidação mantém o registro e o tira da contagem. Não há exclusão nem vínculo com a agenda.
// Mensagens nunca ecoam o conteúdo enviado.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Prisma, type TherapyPlanStatus } from "@/generated/prisma/client";
import { toLocalDate } from "@/modules/agenda/validation";
import { AuthorizationError, assertPermission } from "@/modules/auth/dal";
import { fieldErrors, type FieldErrors } from "@/modules/auth/validation";
import { ClinicoRuleError, PATIENT_NOT_FOUND, assertPatientCanReceiveSession, signature } from "./rules";
import {
  SESSION_TEXT_FIELDS,
  createSessionSchema,
  formatOccurredAt,
  invalidateSessionSchema,
  sessionFormEntries,
  updateSessionSchema,
} from "./session-validation";
import { isPlausibleId } from "./validation";

export type SessionActionState = { ok?: boolean; message?: string; error?: string; fieldErrors?: FieldErrors } | undefined;

type Tx = Prisma.TransactionClient;
type Actor = { id: string; role: string };

const SESSION_NOT_FOUND = "Atendimento não encontrado.";
const SESSION_CONFLICT =
  "Este atendimento foi alterado por outra pessoa enquanto você editava. Recarregue a página para ver a versão atual; suas alterações não foram salvas.";
const OWN_PROFESSIONAL = "Como fisioterapeuta, você registra atendimentos realizados por você.";

class SessionFieldError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

async function guard(): Promise<Actor | SessionActionState> {
  try {
    const actor = await assertPermission("clinico:gerir");
    return { id: actor.id, role: actor.role };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: "Acesso negado." };
    throw error;
  }
}

function isActor(value: unknown): value is Actor {
  return typeof value === "object" && value !== null && "id" in value && "role" in value;
}

function failure(error: unknown): SessionActionState {
  if (error instanceof SessionFieldError) return { fieldErrors: { [error.field]: [error.message] } };
  if (error instanceof ClinicoRuleError) return { error: error.message };
  throw error;
}

const brDate = (date: Date) => date.toISOString().slice(0, 10).split("-").reverse().join("/");

// Responsável: um usuário FISIOTERAPEUTA, ativo ou não (lançamento retroativo de quem saiu).
async function professional(tx: Tx, professionalId: string) {
  const user = await tx.user.findFirst({
    where: { id: professionalId, role: "FISIOTERAPEUTA" },
    select: { id: true, name: true, crefito: true },
  });
  if (!user) throw new SessionFieldError("professionalId", "Selecione um fisioterapeuta.");
  return user;
}

// Consistência temporal: não antes do início do plano (data da revisão 1) e não antes da data da
// revisão aplicada. Datas civis comparadas no fuso da clínica.
function assertTimeline(occurredAt: Date, planStart: Date, revisionDate: Date) {
  const day = toLocalDate(occurredAt);
  const start = planStart.toISOString().slice(0, 10);
  if (day < start) {
    throw new SessionFieldError("occurredDate", `O atendimento não pode ser anterior ao início do plano (${brDate(planStart)}).`);
  }
  if (day < revisionDate.toISOString().slice(0, 10)) {
    throw new SessionFieldError(
      "planRevisionId",
      `A revisão escolhida é de ${brDate(revisionDate)}, posterior à data do atendimento. Escolha a revisão aplicada naquele dia.`,
    );
  }
}

async function planStart(tx: Tx, planId: string) {
  const first = await tx.therapyPlanRevision.findFirst({ where: { planId, number: 1 }, select: { planDate: true } });
  if (!first) throw new ClinicoRuleError("Plano não encontrado.");
  return first.planDate;
}

function revalidate(patientId: string) {
  revalidatePath(`/pacientes/${patientId}/sessoes`, "layout");
  revalidatePath(`/pacientes/${patientId}/planos`, "layout");
  revalidatePath(`/pacientes/${patientId}`);
}

function isIdempotencyConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  return JSON.stringify(error.meta ?? {}).includes("idempotencyKey");
}

// Uso: createSession.bind(null, patientId).
export async function createSession(
  patientId: string,
  _prev: SessionActionState,
  formData: FormData,
): Promise<SessionActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;
  if (!isPlausibleId(patientId)) return { error: PATIENT_NOT_FOUND };

  const parsed = createSessionSchema.safeParse(sessionFormEntries(formData, ["planId", "planRevisionId", "requestId"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { planId, planRevisionId, requestId, professionalId, ...content } = parsed.data;
  if (actor.role === "FISIOTERAPEUTA" && professionalId !== actor.id) return { fieldErrors: { professionalId: [OWN_PROFESSIONAL] } };

  let id: string;
  try {
    id = await prisma.$transaction(async (tx) => {
      await assertPatientCanReceiveSession(tx, patientId);
      // FOR SHARE: um encerramento concorrente do plano espera este registro (ou é esperado e relido).
      const [plan] = await tx.$queryRaw<{ status: TherapyPlanStatus }[]>`
        SELECT "status" FROM "TherapyPlan" WHERE "id" = ${planId} AND "patientId" = ${patientId} FOR SHARE`;
      if (!plan) throw new SessionFieldError("planId", "Selecione um plano deste paciente.");
      if (plan.status !== "ATIVO") {
        throw new SessionFieldError("planId", "Plano encerrado não recebe atendimento. Reabra o plano antes de registrar.");
      }
      const revision = await tx.therapyPlanRevision.findFirst({
        where: { id: planRevisionId, planId },
        select: { planDate: true },
      });
      if (!revision) throw new SessionFieldError("planRevisionId", "Selecione uma revisão deste plano.");
      assertTimeline(content.occurredAt, await planStart(tx, planId), revision.planDate);

      const pro = await professional(tx, professionalId);
      const author = await signature(tx, actor.id);
      const created = await tx.treatmentSession.create({
        data: {
          ...content,
          patientId,
          planId,
          planRevisionId,
          professionalId: pro.id,
          professionalNameSnapshot: pro.name,
          professionalCrefitoSnapshot: pro.crefito,
          idempotencyKey: requestId,
          authorId: actor.id,
          authorNameSnapshot: author.name,
          authorCrefitoSnapshot: author.crefito,
        },
        select: { id: true },
      });
      return created.id;
    });
  } catch (error) {
    // Reenvio do mesmo formulário (duplo clique, rede): devolve o atendimento já criado, sem duplicar.
    if (isIdempotencyConflict(error)) {
      const existing = await prisma.treatmentSession.findFirst({
        where: { idempotencyKey: requestId, patientId },
        select: { id: true },
      });
      if (!existing) return { error: "Dados inválidos. Recarregue a página." };
      id = existing.id;
    } else {
      return failure(error);
    }
  }

  revalidate(patientId);
  redirect(`/pacientes/${patientId}/sessoes/${id}`);
}

// Uso: updateSession.bind(null, patientId, sessionId).
export async function updateSession(
  patientId: string,
  sessionId: string,
  _prev: SessionActionState,
  formData: FormData,
): Promise<SessionActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;
  if (!isPlausibleId(patientId) || !isPlausibleId(sessionId)) return { error: SESSION_NOT_FOUND };

  const parsed = updateSessionSchema.safeParse(sessionFormEntries(formData, ["version", "reason"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { version, reason, professionalId, ...next } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await assertPatientCanReceiveSession(tx, patientId);
      const current = await tx.treatmentSession.findFirst({
        where: { id: sessionId, patientId },
        select: {
          status: true,
          version: true,
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
          planRevision: { select: { planDate: true } },
        },
      });
      if (!current) throw new ClinicoRuleError(SESSION_NOT_FOUND);
      if (current.status !== "VALIDO") throw new ClinicoRuleError("Atendimento invalidado não pode ser corrigido.");
      if (current.version !== version) throw new ClinicoRuleError(SESSION_CONFLICT);

      const professionalChanged = professionalId !== current.professionalId;
      if (professionalChanged && actor.role === "FISIOTERAPEUTA" && professionalId !== actor.id) {
        throw new SessionFieldError("professionalId", OWN_PROFESSIONAL);
      }
      assertTimeline(next.occurredAt, await planStart(tx, current.planId), current.planRevision.planDate);

      const label = (name: string, crefito: string | null) => (crefito ? `${name} (CREFITO ${crefito})` : name);
      const changes: { field: string; previousValue: string | null; newValue: string | null }[] = [];
      if (next.occurredAt.getTime() !== current.occurredAt.getTime()) {
        changes.push({
          field: "occurredAt",
          previousValue: formatOccurredAt(current.occurredAt),
          newValue: formatOccurredAt(next.occurredAt),
        });
      }
      let pro: { id: string; name: string; crefito: string | null } | null = null;
      if (professionalChanged) {
        pro = await professional(tx, professionalId);
        changes.push({
          field: "professional",
          previousValue: label(current.professionalNameSnapshot, current.professionalCrefitoSnapshot),
          newValue: label(pro.name, pro.crefito),
        });
      }
      for (const field of SESSION_TEXT_FIELDS) {
        if (current[field] !== next[field]) changes.push({ field, previousValue: current[field], newValue: next[field] });
      }
      if (changes.length === 0) return;

      // Checagem otimista no próprio UPDATE (e o status continua VALIDO): se outra edição ou uma
      // invalidação gravou antes, nada muda e a transação é desfeita.
      const nextVersion = version + 1;
      const updated = await tx.treatmentSession.updateMany({
        where: { id: sessionId, patientId, version, status: "VALIDO" },
        data: {
          ...next,
          ...(pro
            ? { professionalId: pro.id, professionalNameSnapshot: pro.name, professionalCrefitoSnapshot: pro.crefito }
            : {}),
          version: nextVersion,
          updatedAt: new Date(),
        },
      });
      if (updated.count !== 1) throw new ClinicoRuleError(SESSION_CONFLICT);

      const editor = await signature(tx, actor.id);
      await tx.treatmentSessionChange.createMany({
        data: changes.map((change) => ({
          ...change,
          sessionId,
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
  redirect(`/pacientes/${patientId}/sessoes/${sessionId}`);
}

// Invalida um atendimento lançado por engano: continua consultável, sai da contagem. Irreversível.
// Uso: invalidateSession.bind(null, patientId, sessionId).
export async function invalidateSession(
  patientId: string,
  sessionId: string,
  _prev: SessionActionState,
  formData: FormData,
): Promise<SessionActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;
  if (!isPlausibleId(patientId) || !isPlausibleId(sessionId)) return { error: SESSION_NOT_FOUND };

  const parsed = invalidateSessionSchema.safeParse({ reason: formData.get("reason") ?? undefined });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    await prisma.$transaction(async (tx) => {
      await assertPatientCanReceiveSession(tx, patientId);
      const author = await signature(tx, actor.id);
      const updated = await tx.treatmentSession.updateMany({
        where: { id: sessionId, patientId, status: "VALIDO" },
        data: {
          status: "INVALIDADO",
          invalidationReason: parsed.data.reason,
          invalidatedAt: new Date(),
          invalidatedById: actor.id,
          invalidatedByNameSnapshot: author.name,
          // Edições abertas com a versão anterior passam a conflitar.
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        const exists = await tx.treatmentSession.findFirst({ where: { id: sessionId, patientId }, select: { id: true } });
        throw new ClinicoRuleError(exists ? "Este atendimento já foi invalidado." : SESSION_NOT_FOUND);
      }
    });
  } catch (error) {
    return failure(error);
  }

  revalidate(patientId);
  return { ok: true, message: "Atendimento invalidado." };
}
