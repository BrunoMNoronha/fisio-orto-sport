import "server-only";
import type { z } from "zod";
import type { AppointmentAttendance, AppointmentStatus, Prisma, PrismaClient } from "@/generated/prisma/client";
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
// MEL-01 (#44): agendamento com atendimento válido ou presença marcada não é cancelado nem reagendado.
export const HAS_SESSION: AgendaFailure = {
  error:
    "Este agendamento tem atendimento registrado e não pode ser cancelado nem reagendado. Se o atendimento foi lançado por engano, invalide-o antes.",
};
export const HAS_ATTENDANCE: AgendaFailure = {
  error: "Este agendamento tem presença marcada. Remova a marcação antes de cancelar ou reagendar.",
};
export const ATTENDANCE_LOCKED: AgendaFailure = {
  error:
    "Há atendimento registrado para este agendamento: a presença fica como compareceu. Para mudar, invalide o atendimento antes.",
};
export const ATTENDANCE_TOO_EARLY: AgendaFailure = {
  error: "A presença só pode ser marcada a partir do início do horário agendado.",
};
export const ATTENDANCE_CANCELLED: AgendaFailure = { error: "Agendamento cancelado não recebe marcação de presença." };

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

type LockedAppointment = {
  status: AppointmentStatus;
  startsAt: Date;
  attendance: AppointmentAttendance | null;
};

// Trava a linha do agendamento até o fim da transação. Cancelar, reagendar, marcar presença e gerar
// atendimento (clinico/session-appointment.ts) passam por aqui, então não se intercalam.
export async function lockAppointment(tx: Prisma.TransactionClient, id: string): Promise<LockedAppointment | null> {
  const [row] = await tx.$queryRaw<LockedAppointment[]>`
    SELECT "status", "startsAt", "attendance" FROM "Appointment" WHERE "id" = ${id} FOR UPDATE`;
  return row ?? null;
}

// Só o id: a agenda sabe que há atendimento, nunca o conteúdo clínico.
export async function hasValidSession(tx: Prisma.TransactionClient, appointmentId: string) {
  const session = await tx.treatmentSession.findFirst({
    where: { appointmentId, status: "VALIDO" },
    select: { id: true },
  });
  return session !== null;
}

// Agendamento já travado e AGENDADO: pode deixar de ocupar o horário ou mudar de horário?
async function blockedByRecord(tx: Prisma.TransactionClient, id: string, locked: LockedAppointment) {
  if (await hasValidSession(tx, id)) return HAS_SESSION;
  if (locked.attendance) return HAS_ATTENDANCE;
  return null;
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
    const locked = await lockAppointment(tx, id);
    if (!locked) return NOT_FOUND;
    if (locked.status !== "AGENDADO") return ALREADY_CANCELLED;
    const blocked = await blockedByRecord(tx, id, locked);
    if (blocked) return blocked;
    await assertProfessionalAvailable(tx, slot.professionalId);
    await assertNoConflict(tx, slot, id);
    await tx.appointment.update({ where: { id }, data: { ...slot, updatedById: actorId }, select: { id: true } });
    return null;
  });
}

// Só cancela o que ainda está AGENDADO, sem atendimento válido nem presença marcada; o registro é
// preservado e deixa de ocupar o horário.
export async function cancelAppointmentRecord(
  db: Db,
  id: string,
  reason: string | null | undefined,
  actorId: string,
): Promise<AgendaFailure | null> {
  return db.$transaction(async (tx) => {
    const locked = await lockAppointment(tx, id);
    if (!locked) return NOT_FOUND;
    if (locked.status !== "AGENDADO") return { error: "Agendamento já está cancelado." };
    const blocked = await blockedByRecord(tx, id, locked);
    if (blocked) return blocked;
    await tx.appointment.update({
      where: { id },
      data: {
        status: "CANCELADO",
        cancelledAt: new Date(),
        cancelReason: reason,
        cancelledById: actorId,
        updatedById: actorId,
      },
      select: { id: true },
    });
    return null;
  });
}

// Presença (MEL-01): registro administrativo a partir do início do horário, só em agendamento
// AGENDADO. `null` remove a marcação. Guarda só a última marcação (quem e quando). Com atendimento
// válido vinculado, fica travada em COMPARECEU. Não altera a ocupação do horário.
export async function setAttendanceRecord(
  db: Db,
  id: string,
  attendance: AppointmentAttendance | null,
  actorId: string,
  now: Date = new Date(),
): Promise<AgendaFailure | null> {
  return db.$transaction(async (tx) => {
    const locked = await lockAppointment(tx, id);
    if (!locked) return NOT_FOUND;
    if (locked.status !== "AGENDADO") return ATTENDANCE_CANCELLED;
    if (locked.startsAt.getTime() > now.getTime()) return ATTENDANCE_TOO_EARLY;
    if (locked.attendance === attendance) return null;
    if (await hasValidSession(tx, id)) return ATTENDANCE_LOCKED;
    await tx.appointment.update({
      where: { id },
      data: attendance
        ? { attendance, attendanceMarkedAt: now, attendanceMarkedById: actorId }
        : { attendance: null, attendanceMarkedAt: null, attendanceMarkedById: null },
      select: { id: true },
    });
    return null;
  });
}
