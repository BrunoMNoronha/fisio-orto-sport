import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { insertRecurringAppointments, RecurringAppointmentError } from "@/modules/agenda/recurring-service";
import { insertAppointment, insertScheduleBlock, cancelAppointmentRecord, setAttendanceRecord, moveAppointment } from "@/modules/agenda/service";
import { AgendaRuleError, PatientConflictWarning } from "@/modules/agenda/rules";
import { addDays, toInstant, toLocalDate } from "@/modules/agenda/validation";
import { recurrenceDates } from "@/modules/agenda/recurrence";
import { inspectSchema } from "@/modules/manutencao/reset";

const url = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !url) throw new Error("INTEGRATION_DATABASE_URL obrigatória.");

describe("agendamento recorrente PostgreSQL (#132)", { skip: !url }, () => {
  const clients: PrismaClient[] = [];
  const client = () => {
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    clients.push(db); return db;
  };
  let db: PrismaClient;
  let actor: string;
  let patient: string;
  let professional: string;
  let otherProfessional: string;
  let otherPatient: string;
  let day = 0;
  const weekdays = [1, 2, 3, 4, 5, 6, 7];
  function input() {
    const date = addDays("2096-01-01", ++day * 14);
    const data = { patientId: patient, professionalId: professional, startsAt: toInstant(date, "14:00"), endsAt: toInstant(date, "15:00"), notes: "Observação administrativa fictícia" };
    return { date, data, recurrence: { date, weekdays, sessionCount: 3 } };
  }
  const records = (batchId?: string) => db.appointment.findMany({ where: batchId ? { batchId } : { professionalId: professional }, orderBy: { startsAt: "asc" } });
  const setting = (data: { maxRecurringSessions?: number; maxSimultaneousAppointments?: number; businessHoursEnabled?: boolean; businessHours?: string }) => db.clinicSettings.update({ where: { id: 1 }, data });
  before(async () => {
    db = client();
    const user = async (name: string) => (await db.user.create({ data: { name, email: `${randomUUID()}@teste.local`, role: "FISIOTERAPEUTA", passwordHash: "x" } })).id;
    actor = await user("Operador Recorrência"); professional = await user("Profissional Recorrência"); otherProfessional = await user("Outro Profissional Recorrência");
    const createPatient = async () => (await db.patient.create({ data: { fullName: "Paciente Fictício Recorrência", birthDate: new Date("1990-01-01"), phone: "11999999999", createdById: actor, updatedById: actor } })).id;
    patient = await createPatient(); otherPatient = await createPatient();
    await db.clinicSettings.create({ data: { id: 1, updatedById: actor, maxSimultaneousAppointments: 1 } });
  });
  after(async () => {
    await db?.clinicSettings.deleteMany({});
    await Promise.all(clients.map((c) => c.$disconnect()));
  });

  it("manutenção reconhece a tabela de lotes no escopo de limpeza", async () => {
    assert.deepEqual(await inspectSchema(db), []);
  });

  it("aplica o exemplo exato e mantém os dados comuns; atendimento/presença não são criados", async () => {
    const data = { ...input().data, startsAt: toInstant("2026-10-19", "14:00"), endsAt: toInstant("2026-10-19", "15:00") };
    const result = await insertRecurringAppointments(db, data, { date: "2026-10-19", sessionCount: 5, weekdays: [1, 3, 5] }, actor, randomUUID());
    const first = await db.appointment.findUniqueOrThrow({ where: { id: result.id } });
    const rows = await records(first.batchId!);
    assert.equal(result.count, 5);
    assert.deepEqual(rows.map((row) => toLocalDate(row.startsAt)), ["2026-10-19", "2026-10-21", "2026-10-23", "2026-10-26", "2026-10-28"]);
    for (const row of rows) {
      assert.equal(row.patientId, patient); assert.equal(row.professionalId, professional); assert.equal(row.notes, data.notes);
      assert.equal(row.attendance, null); assert.equal(row.status, "AGENDADO"); assert.equal(row.createdById, actor);
    }
    assert.equal(await db.treatmentSession.count({ where: { appointmentId: { in: rows.map((row) => row.id) } } }), 0);
  });

  it("reenvios simultâneos e posteriores retornam o mesmo lote", async () => {
    const { date, data, recurrence } = input(); const key = randomUUID();
    const results = await Promise.all([insertRecurringAppointments(db, data, recurrence, actor, key), insertRecurringAppointments(client(), data, recurrence, actor, key)]);
    assert.deepEqual(results[0], results[1]);
    const batch = await db.appointmentBatch.findUniqueOrThrow({ where: { createdById_requestKey: { createdById: actor, requestKey: key } }, include: { appointments: true } });
    assert.equal(batch.appointments.length, 3);
    await moveAppointment(db, results[0].id, { professionalId: professional, startsAt: toInstant(addDays(date, 5), "14:00"), endsAt: toInstant(addDays(date, 5), "15:00") }, actor);
    assert.deepEqual(await insertRecurringAppointments(db, data, recurrence, actor, key), results[0]);
    await setting({ maxRecurringSessions: 1 });
    assert.deepEqual(await insertRecurringAppointments(db, data, recurrence, actor, key), results[0]);
    await setting({ maxRecurringSessions: 10 });
    await assert.rejects(insertRecurringAppointments(db, { ...data, notes: "Alterado" }, recurrence, actor, key), AgendaRuleError);
  });

  it("limite padrão 10, configuração vigente e CHECK do banco", async () => {
    const { data, recurrence } = input();
    assert.equal((await db.clinicSettings.findUniqueOrThrow({ where: { id: 1 } })).maxRecurringSessions, 10);
    await assert.rejects(insertRecurringAppointments(db, data, { ...recurrence, sessionCount: 11 }, actor, randomUUID()), /limite atual é de 10/);
    await setting({ maxRecurringSessions: 2 });
    await assert.rejects(insertRecurringAppointments(db, data, recurrence, actor, randomUUID()), /limite atual é de 2/);
    await assert.rejects(setting({ maxRecurringSessions: 0 }));
    await setting({ maxRecurringSessions: 10 });
  });

  for (const failedIndex of [1, 2]) {
    it(`bloqueio na ocorrência ${failedIndex + 1} impede todo o lote e permite corrigir/repetir`, async () => {
      const { date, data, recurrence } = input(); const key = randomUUID();
      const blockedDate = addDays(date, failedIndex);
      const blockId = await insertScheduleBlock(db, { professionalId: professional, startsAt: toInstant(blockedDate, "14:00"), endsAt: toInstant(blockedDate, "15:00"), reason: null }, actor);
      await assert.rejects(insertRecurringAppointments(db, data, recurrence, actor, key), (error: unknown) => {
        assert.ok(error instanceof RecurringAppointmentError);
        assert.equal(error.occurrences[0].date, blockedDate); return true;
      });
      assert.equal(await db.appointmentBatch.count({ where: { requestKey: key } }), 0);
      assert.equal(await db.appointment.count({ where: { professionalId: professional, startsAt: { gte: data.startsAt, lt: toInstant(addDays(date, 3), "00:00") } } }), 0);
      await db.scheduleBlock.update({ where: { id: blockId }, data: { removedAt: new Date(), removedById: actor } });
      assert.equal((await insertRecurringAppointments(db, data, recurrence, actor, key)).count, 3);
    });
  }

  it("capacidade na última ocorrência bloqueia o lote mesmo com confirmação de conflito", async () => {
    const { date, data, recurrence } = input(); const key = randomUUID();
    await insertAppointment(db, { ...data, patientId: otherPatient, startsAt: toInstant(addDays(date, 2), "14:00"), endsAt: toInstant(addDays(date, 2), "15:00") }, actor);
    await assert.rejects(insertRecurringAppointments(db, data, recurrence, actor, key, { allowPatientConflict: true }), RecurringAppointmentError);
    assert.equal(await db.appointmentBatch.count({ where: { requestKey: key } }), 0);
  });

  it("expediente aplicado a cada ocorrência sem pular dias fechados", async () => {
    const { date, data, recurrence } = input();
    const days = ["14:00-16:00", "14:00-16:00", "14:00-16:00", "14:00-16:00", "14:00-16:00", "14:00-16:00", "14:00-16:00"];
    const closedDate = addDays(date, 1);
    const index = new Date(`${closedDate}T12:00Z`).getUTCDay();
    days[index] = "";
    await setting({ businessHoursEnabled: true, businessHours: days.join(";") });
    const key = randomUUID();
    await assert.rejects(insertRecurringAppointments(db, data, recurrence, actor, key), (error: unknown) => {
      assert.ok(error instanceof RecurringAppointmentError); assert.equal(error.occurrences[0].date, closedDate); return true;
    });
    assert.equal(await db.appointmentBatch.count({ where: { requestKey: key } }), 0);
    await setting({ businessHoursEnabled: false });
  });

  it("avisa todos os conflitos do paciente antes de gravar e permite confirmação", async () => {
    const { date, data, recurrence } = input(); const key = randomUUID();
    for (const offset of [0, 2]) {
      await insertAppointment(db, { ...data, professionalId: otherProfessional, startsAt: toInstant(addDays(date, offset), "14:00"), endsAt: toInstant(addDays(date, offset), "15:00") }, actor);
    }
    await assert.rejects(insertRecurringAppointments(db, data, recurrence, actor, key), (error: unknown) => {
      assert.ok(error instanceof PatientConflictWarning); assert.equal(error.conflicts.length, 2); return true;
    });
    assert.equal(await db.appointmentBatch.count({ where: { requestKey: key } }), 0);
    assert.equal((await insertRecurringAppointments(db, data, recurrence, actor, key, { allowPatientConflict: true })).count, 3);
  });

  it("lotes concorrentes diferentes não excedem a capacidade", async () => {
    const { data, recurrence } = input();
    const outcomes = await Promise.allSettled([
      insertRecurringAppointments(db, data, recurrence, actor, randomUUID()),
      insertRecurringAppointments(client(), data, recurrence, actor, randomUUID()),
    ]);
    assert.equal(outcomes.filter((row) => row.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((row) => row.status === "rejected").length, 1);
  });

  it("bloqueio concorrente e lote nunca ficam ambos ativos", async () => {
    const { date, data, recurrence } = input();
    const outcomes = await Promise.allSettled([
      insertRecurringAppointments(db, data, recurrence, actor, randomUUID()),
      insertScheduleBlock(client(), { professionalId: professional, startsAt: toInstant(addDays(date, 2), "14:00"), endsAt: toInstant(addDays(date, 2), "15:00"), reason: null }, actor),
    ]);
    assert.equal(outcomes.filter((row) => row.status === "fulfilled").length, 1);
  });

  it("paciente e profissional inativos são recusados e cancelar um não altera os outros", async () => {
    const { data, recurrence } = input();
    await db.patient.update({ where: { id: patient }, data: { status: "INATIVO" } });
    await assert.rejects(insertRecurringAppointments(db, data, recurrence, actor, randomUUID()), /Paciente inativo/);
    await db.patient.update({ where: { id: patient }, data: { status: "ATIVO" } });
    await db.user.update({ where: { id: professional }, data: { active: false } });
    await assert.rejects(insertRecurringAppointments(db, data, recurrence, actor, randomUUID()), /Profissional inativo/);
    await db.user.update({ where: { id: professional }, data: { active: true } });
    const created = await insertRecurringAppointments(db, data, recurrence, actor, randomUUID());
    const first = await db.appointment.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(await cancelAppointmentRecord(db, created.id, null, actor), null);
    const rows = await records(first.batchId!);
    assert.equal(rows.filter((row) => row.status === "CANCELADO").length, 1);
    assert.equal(rows.filter((row) => row.status === "AGENDADO").length, 2);
    assert.equal(await setAttendanceRecord(db, rows[1].id, "COMPARECEU", actor, new Date("2099-01-01")), null);
    assert.equal(await setAttendanceRecord(db, rows[1].id, null, actor, new Date("2099-01-01")), null);
  });

  it("uma sessão é válida e normaliza ordem dos dias na mesma chave", async () => {
    const { date, data: initial } = input(); const key = randomUUID();
    const data = { ...initial, notes: null };
    const rule = { date, weekdays, sessionCount: 1 };
    const result = await insertRecurringAppointments(db, data, rule, actor, key);
    assert.equal(result.count, 1);
    assert.deepEqual(await insertRecurringAppointments(db, data, { ...rule, weekdays: [...weekdays].reverse() }, actor, key), result);
    assert.equal(recurrenceDates(rule).length, 1);
  });

  it("falha real na terceira inserção reverte os dois primeiros registros e a chave", async () => {
    const { date, data, recurrence } = input(); const key = randomUUID();
    const cutoff = toInstant(addDays(date, 2), "14:00").toISOString();
    // Constraint exclusiva do teste: a validação passa, mas o banco recusa a terceira linha.
    await db.$executeRawUnsafe(`ALTER TABLE "Appointment" ADD CONSTRAINT "Issue132_test_failure" CHECK ("notes" IS DISTINCT FROM 'issue132-force-failure' OR "startsAt" < '${cutoff}'::timestamptz) NOT VALID`);
    try {
      await assert.rejects(insertRecurringAppointments(db, { ...data, notes: "issue132-force-failure" }, recurrence, actor, key));
      assert.equal(await db.appointmentBatch.count({ where: { requestKey: key } }), 0);
      assert.equal(await db.appointment.count({ where: { notes: "issue132-force-failure" } }), 0);
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE "Appointment" DROP CONSTRAINT "Issue132_test_failure"');
    }
  });

  it("limite parametrizado permite lote no teto técnico de 100", async () => {
    await setting({ maxRecurringSessions: 100 });
    const date = "2095-01-03";
    const data = { ...input().data, startsAt: toInstant(date, "14:00"), endsAt: toInstant(date, "15:00") };
    const result = await insertRecurringAppointments(db, data, { date, weekdays, sessionCount: 100 }, actor, randomUUID());
    assert.equal(result.count, 100);
    const first = await db.appointment.findUniqueOrThrow({ where: { id: result.id } });
    assert.equal((await records(first.batchId!)).length, 100);
    await setting({ maxRecurringSessions: 10 });
  });
});
