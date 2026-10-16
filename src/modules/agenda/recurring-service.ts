import "server-only";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_MAX_RECURRING_SESSIONS, displayDate, recurrenceDates, recurrenceSchema, recurringRequestSchema, type Recurrence } from "./recurrence";
import { appointmentSchema, toInstant, toLocalDate, toLocalTime } from "./validation";
import { lockProfessionals, type NewAppointment, type PatientConflictOption } from "./service";
import {
  AgendaRuleError, PatientConflictWarning, assertNoConflict, assertNotBlocked,
  assertPatientActive, assertProfessionalAvailable, assertWithinBusinessHours, type ConflictItem,
  checkPatientConflict, isOverlapViolation, CONFLICT_MESSAGE,
} from "./rules";

export type OccurrenceError = { date: string; startTime: string; endTime: string; message: string };
export class RecurringAppointmentError extends Error {
  constructor(public occurrences: OccurrenceError[]) {
    super("Nenhum agendamento foi criado. Ajuste as ocorrências indicadas.");
  }
}

export async function insertRecurringAppointments(
  db: Pick<PrismaClient, "$transaction">,
  data: NewAppointment,
  recurrence: Recurrence,
  actorId: string,
  requestKey: string,
  { allowPatientConflict = false }: PatientConflictOption = {},
): Promise<{ id: string; count: number }> {
  const date = toLocalDate(data.startsAt);
  const startTime = toLocalTime(data.startsAt);
  const endTime = toLocalTime(data.endsAt);
  const rule = recurrenceSchema.parse({ ...recurrence, date });
  requestKey = recurringRequestSchema.parse({ requestKey }).requestKey;
  // Mesmo contrato da criação avulsa, inclusive duração/fim no mesmo dia.
  const base = appointmentSchema.parse({ ...data, notes: data.notes ?? undefined, date, startTime, endTime });
  const dates = recurrenceDates(rule);
  const requestHash = createHash("sha256").update(JSON.stringify({
    ...base, sessionCount: rule.sessionCount, weekdays: rule.weekdays,
  })).digest("hex");

  return db.$transaction(async (tx) => {
    await lockProfessionals(tx, [base.professionalId]);
    // Serializa a tentativa mesmo se alguém reenviar a mesma chave com outro profissional.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`agenda:batch:${actorId}:${requestKey}`}, 0))`;
    const existing = await tx.appointmentBatch.findUnique({
      where: { createdById_requestKey: { createdById: actorId, requestKey } },
      select: { requestHash: true, appointmentIds: true },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AgendaRuleError("Esta tentativa já foi usada com outros dados. Altere o formulário para iniciar uma nova tentativa.");
      }
      return { id: existing.appointmentIds[0], count: existing.appointmentIds.length };
    }
    await assertPatientActive(tx, base.patientId);
    await assertProfessionalAvailable(tx, base.professionalId);
    const settings = await tx.clinicSettings.findUnique({ where: { id: 1 }, select: { maxRecurringSessions: true } });
    const maxSessions = settings?.maxRecurringSessions ?? DEFAULT_MAX_RECURRING_SESSIONS;
    if (rule.sessionCount > maxSessions) {
      throw new AgendaRuleError(`O limite atual é de ${maxSessions} sessões por agendamento recorrente.`, "sessionCount");
    }
    const occurrences = dates.map((day) => ({
      ...base, startsAt: toInstant(day, startTime), endsAt: toInstant(day, endTime),
    }));
    const failures: OccurrenceError[] = [];
    const warnings = new Map<string, ConflictItem>();
    for (let index = 0; index < occurrences.length; index++) {
      const slot = occurrences[index];
      try {
        await assertWithinBusinessHours(tx, slot);
        await assertNotBlocked(tx, slot);
        await assertNoConflict(tx, slot);
        if (!allowPatientConflict) await checkPatientConflict(tx, slot);
      } catch (error) {
        if (error instanceof PatientConflictWarning) {
          for (const item of error.conflicts) {
            warnings.set(item.id, { ...item, label: `Sessão de ${displayDate(dates[index])} às ${startTime}: ${item.label}` });
          }
        } else if (error instanceof AgendaRuleError) {
          failures.push({ date: dates[index], startTime, endTime, message: error.message });
        } else { throw error; }
      }
    }
    if (failures.length) throw new RecurringAppointmentError(failures);
    if (warnings.size) throw new PatientConflictWarning([...warnings.values()]);
    const batch = await tx.appointmentBatch.create({ data: { requestKey, requestHash, createdById: actorId }, select: { id: true } });
    // Inserir na mesma transação mantém triggers e atomicidade inclusive se o banco recusar uma linha.
    const appointmentIds: string[] = [];
    for (let index = 0; index < occurrences.length; index++) {
      try {
        const created = await tx.appointment.create({
          data: { ...occurrences[index], batchId: batch.id, createdById: actorId, updatedById: actorId }, select: { id: true },
        });
        appointmentIds.push(created.id);
      } catch (error) {
        if (isOverlapViolation(error)) {
          throw new RecurringAppointmentError([{ date: dates[index], startTime, endTime, message: CONFLICT_MESSAGE }]);
        }
        throw error;
      }
    }
    await tx.appointmentBatch.update({ where: { id: batch.id }, data: { appointmentIds } });
    return { id: appointmentIds[0], count: appointmentIds.length };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 120_000 });
}
