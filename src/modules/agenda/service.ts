import "server-only";
import type { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { FieldErrors } from "@/modules/auth/validation";
import {
  AgendaRuleError,
  CONFLICT_MESSAGE,
  assertNoConflict,
  assertPatientActive,
  assertProfessionalAvailable,
  isOverlapViolation,
} from "./rules";
import type { appointmentSchema, rescheduleSchema } from "./validation";

// Operações da agenda no banco, sem autorização nem navegação (feitas pelas actions). Recebem o
// cliente Prisma para que os testes de integração exercitem exatamente estas transações.
type Db = Pick<PrismaClient, "$transaction" | "appointment">;
export type AgendaFailure = { error?: string; fieldErrors?: FieldErrors };
export type NewAppointment = z.output<typeof appointmentSchema>;
export type AppointmentSlot = Omit<z.output<typeof rescheduleSchema>, "id">;

export const NOT_FOUND: AgendaFailure = { error: "Agendamento não encontrado." };
export const ALREADY_CANCELLED: AgendaFailure = { error: "Agendamento cancelado não pode ser alterado." };
export const RETRY_LATER: AgendaFailure = { error: "A agenda foi alterada ao mesmo tempo por outra pessoa. Tente novamente." };

// P2034: o PostgreSQL abortou a transação por deadlock ou conflito de escrita. Com o lock por
// profissional abaixo isso não deveria ocorrer; se ocorrer, nada foi gravado e o usuário tenta de novo.
function isWriteConflict(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2034";
}

// Serializa, por profissional, as transações que criam ou movem agendamentos (issue #39). Sem isso,
// duas transações simultâneas passam pela checagem de conflito, esperam uma pela outra na constraint
// e o PostgreSQL pode abortar uma por deadlock (erro 500 em vez da mensagem de conflito). Com o lock,
// a segunda espera a primeira terminar e a checagem já enxerga o que foi confirmado. Os locks são
// tomados em ordem fixa (reagendar pode envolver dois profissionais) e liberados no fim da transação.
async function lockProfessionals(tx: Prisma.TransactionClient, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`agenda:${id}`}, 0))`;
  }
}

// Erros de regra viram resposta do formulário; o resto propaga.
export function ruleFailure(error: unknown): AgendaFailure | null {
  if (error instanceof AgendaRuleError) {
    return error.field ? { fieldErrors: { [error.field]: [error.message] } } : { error: error.message };
  }
  if (isOverlapViolation(error)) return { fieldErrors: { startTime: [CONFLICT_MESSAGE] } };
  if (isWriteConflict(error)) return RETRY_LATER;
  return null;
}

// A checagem de conflito na transação dá a mensagem amigável; a constraint Appointment_no_overlap
// (23P01) continua barrando qualquer escrita que não passe por aqui.
export async function insertAppointment(db: Db, data: NewAppointment, actorId: string): Promise<string> {
  return db.$transaction(async (tx) => {
    await lockProfessionals(tx, [data.professionalId]);
    await assertPatientActive(tx, data.patientId);
    await assertProfessionalAvailable(tx, data.professionalId);
    await assertNoConflict(tx, data);
    const created = await tx.appointment.create({
      data: { ...data, createdById: actorId, updatedById: actorId },
      select: { id: true },
    });
    return created.id;
  });
}

// null = reagendado; senão, a falha de negócio a exibir.
export async function moveAppointment(
  db: Db,
  id: string,
  slot: AppointmentSlot,
  actorId: string,
): Promise<AgendaFailure | null> {
  return db.$transaction(async (tx) => {
    const current = await tx.appointment.findUnique({ where: { id }, select: { professionalId: true } });
    if (!current) return NOT_FOUND;
    await lockProfessionals(tx, [current.professionalId, slot.professionalId]);
    // Relido depois do lock: um cancelamento ou reagendamento simultâneo já terminou.
    const locked = await tx.appointment.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (locked.status !== "AGENDADO") return ALREADY_CANCELLED;
    await assertProfessionalAvailable(tx, slot.professionalId);
    await assertNoConflict(tx, slot, id);
    await tx.appointment.update({ where: { id }, data: { ...slot, updatedById: actorId }, select: { id: true } });
    return null;
  });
}

// Só cancela o que ainda está AGENDADO; o registro é preservado e deixa de ocupar o horário.
export async function cancelAppointmentRecord(
  db: Db,
  id: string,
  reason: string | null | undefined,
  actorId: string,
): Promise<AgendaFailure | null> {
  const result = await db.appointment.updateMany({
    where: { id, status: "AGENDADO" },
    data: {
      status: "CANCELADO",
      cancelledAt: new Date(),
      cancelReason: reason,
      cancelledById: actorId,
      updatedById: actorId,
    },
  });
  if (result.count > 0) return null;
  const exists = await db.appointment.findUnique({ where: { id }, select: { id: true } });
  return exists ? { error: "Agendamento já está cancelado." } : NOT_FOUND;
}
