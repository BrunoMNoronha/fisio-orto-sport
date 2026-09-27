// Integração com PostgreSQL real da MEL-02 (#45): bloqueios de horário por profissional e aviso de
// conflito do paciente, nas transações de service.ts (as mesmas das actions). Roda só com
// INTEGRATION_DATABASE_URL apontando para um banco DESCARTÁVEL já migrado; na CI é obrigatória.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { BLOCKED_MESSAGE } from "@/modules/agenda/rules";
import {
  BLOCK_ALREADY_REMOVED,
  BLOCK_NOT_FOUND,
  cancelAppointmentRecord,
  insertAppointment,
  insertScheduleBlock,
  moveAppointment,
  removeScheduleBlock,
  ruleFailure,
} from "@/modules/agenda/service";
import { toInstant } from "@/modules/agenda/validation";

const url = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !url) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

const BLOCKED = { fieldErrors: { startTime: [BLOCKED_MESSAGE] } };

describe("bloqueios e conflito do paciente no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  const clients: PrismaClient[] = [];
  let prisma: PrismaClient;
  let raw: Client;
  const suffix = Date.now();
  let actorId: string;
  let fisioA: string;
  let fisioB: string;
  let patients = 0;
  let day = 0;

  const client = () => {
    const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    clients.push(c);
    return c;
  };

  // Um dia próprio por teste, em data civil da clínica (o futuro distante evita dados existentes).
  function newDay() {
    const date = new Date(Date.UTC(2097, 0, 1));
    date.setUTCDate(date.getUTCDate() + ++day);
    const civil = date.toISOString().slice(0, 10);
    return (hour: number, minute = 0) =>
      toInstant(civil, `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }

  async function newPatient() {
    const patient = await prisma.patient.create({
      data: {
        fullName: `Paciente Bloqueio ${++patients}`,
        birthDate: new Date("1990-01-01"),
        phone: "11999999999",
        createdById: actorId,
        updatedById: actorId,
      },
      select: { id: true },
    });
    return patient.id;
  }

  const booking = (patientId: string, professionalId: string, startsAt: Date, endsAt: Date) => ({
    patientId,
    professionalId,
    startsAt,
    endsAt,
    notes: null,
  });
  const block = (professionalId: string, startsAt: Date, endsAt: Date) => ({
    professionalId,
    startsAt,
    endsAt,
    reason: "Férias",
  });

  async function outcome<T>(promise: Promise<T>) {
    try {
      return { ok: await promise };
    } catch (error) {
      const failure = ruleFailure(error);
      if (!failure) throw error;
      return { failure };
    }
  }

  before(async () => {
    prisma = client();
    raw = new Client({ connectionString: url });
    await raw.connect();
    const user = (name: string, role: "FISIOTERAPEUTA" | "RECEPCAO") =>
      prisma.user.create({
        data: { name, email: `${name.toLowerCase()}-bloq-${suffix}@teste.local`, passwordHash: "x", role },
        select: { id: true },
      });
    actorId = (await user("RecepcaoBloq", "RECEPCAO")).id;
    fisioA = (await user("FisioBloqA", "FISIOTERAPEUTA")).id;
    fisioB = (await user("FisioBloqB", "FISIOTERAPEUTA")).id;
  });

  after(async () => {
    await raw?.end();
    await Promise.all(clients.map((c) => c.$disconnect()));
  });

  it("não se agenda sobre bloqueio; horários adjacentes são aceitos; outro profissional é independente", async () => {
    const at = newDay();
    const patient = await newPatient();
    await insertScheduleBlock(prisma, block(fisioA, at(8), at(12)), actorId);

    for (const [start, end] of [
      [at(7, 30), at(8, 30)],
      [at(11, 30), at(12, 30)],
      [at(9), at(10)],
      [at(7), at(13)],
    ]) {
      assert.deepEqual((await outcome(insertAppointment(prisma, booking(patient, fisioA, start, end), actorId))).failure, BLOCKED);
    }
    // [início, fim): encostar no bloqueio não é sobrepor.
    await insertAppointment(prisma, booking(patient, fisioA, at(7), at(8)), actorId);
    await insertAppointment(prisma, booking(patient, fisioA, at(12), at(13)), actorId);
    // Outro profissional no mesmo horário: livre (outro paciente, sem aviso).
    await insertAppointment(prisma, booking(await newPatient(), fisioB, at(9), at(10)), actorId);
  });

  it("fuso America/Sao_Paulo: bloqueio 08:00–12:00 local ocupa 11:00–15:00 UTC", async () => {
    const date = "2097-06-10";
    const id = await insertScheduleBlock(
      prisma,
      block(fisioA, toInstant(date, "08:00"), toInstant(date, "12:00")),
      actorId,
    );
    const stored = await prisma.scheduleBlock.findUniqueOrThrow({ where: { id }, select: { startsAt: true, endsAt: true } });
    assert.equal(stored.startsAt.toISOString(), "2097-06-10T11:00:00.000Z");
    assert.equal(stored.endsAt.toISOString(), "2097-06-10T15:00:00.000Z");
    const patient = await newPatient();
    // 12:00 local (15:00 UTC) é adjacente; 11:59 local sobrepõe.
    await insertAppointment(prisma, booking(patient, fisioA, toInstant(date, "12:00"), toInstant(date, "13:00")), actorId);
    const overlap = await outcome(
      insertAppointment(prisma, booking(patient, fisioA, toInstant(date, "11:59"), toInstant(date, "12:00")), actorId),
    );
    assert.deepEqual(overlap.failure, BLOCKED);
  });

  it("reagendar para horário bloqueado é recusado e o agendamento continua onde estava", async () => {
    const at = newDay();
    const patient = await newPatient();
    const id = await insertAppointment(prisma, booking(patient, fisioB, at(15), at(16)), actorId);
    await insertScheduleBlock(prisma, block(fisioA, at(9), at(11)), actorId);
    const result = await outcome(moveAppointment(prisma, id, { professionalId: fisioA, startsAt: at(10), endsAt: at(11) }, actorId));
    assert.deepEqual(result.failure, BLOCKED);
    const kept = await prisma.appointment.findUniqueOrThrow({ where: { id }, select: { professionalId: true, startsAt: true } });
    assert.equal(kept.professionalId, fisioB);
    assert.equal(kept.startsAt.getTime(), at(15).getTime());
    assert.equal(await moveAppointment(prisma, id, { professionalId: fisioA, startsAt: at(11), endsAt: at(12) }, actorId), null);
  });

  it("bloqueio sobre agendamento ativo é recusado com a lista, sem cancelar nada; cancelado e adjacente não impedem", async () => {
    const at = newDay();
    const patient = await newPatient();
    const active = await insertAppointment(prisma, booking(patient, fisioA, at(9), at(10)), actorId);
    const cancelled = await insertAppointment(prisma, booking(patient, fisioA, at(14), at(15)), actorId);
    assert.equal(await cancelAppointmentRecord(prisma, cancelled, undefined, actorId), null);

    const refused = await outcome(insertScheduleBlock(prisma, block(fisioA, at(8), at(18)), actorId));
    assert.match(refused.failure?.error ?? "", /Reagende ou cancele/);
    assert.deepEqual(refused.failure?.conflicts?.map((item) => item.id), [active]);
    const still = await prisma.appointment.findUniqueOrThrow({ where: { id: active }, select: { status: true } });
    assert.equal(still.status, "AGENDADO");
    assert.equal(await prisma.scheduleBlock.count({ where: { professionalId: fisioA, startsAt: at(8) } }), 0);

    // Adjacente ao agendamento (10:00) e sobre o cancelado: aceito.
    assert.equal(typeof (await insertScheduleBlock(prisma, block(fisioA, at(10), at(18)), actorId)), "string");
  });

  it("remover o bloqueio libera o horário; remover de novo ou inexistente é informado", async () => {
    const at = newDay();
    const patient = await newPatient();
    const id = await insertScheduleBlock(prisma, block(fisioA, at(9), at(10)), actorId);
    assert.deepEqual((await outcome(insertAppointment(prisma, booking(patient, fisioA, at(9), at(10)), actorId))).failure, BLOCKED);

    assert.equal(await removeScheduleBlock(prisma, id, actorId), null);
    const removed = await prisma.scheduleBlock.findUniqueOrThrow({ where: { id }, select: { removedAt: true, removedById: true } });
    assert.ok(removed.removedAt);
    assert.equal(removed.removedById, actorId);
    assert.equal(typeof (await insertAppointment(prisma, booking(patient, fisioA, at(9), at(10)), actorId)), "string");

    assert.deepEqual(await removeScheduleBlock(prisma, id, actorId), BLOCK_ALREADY_REMOVED);
    assert.deepEqual(await removeScheduleBlock(prisma, "inexistente", actorId), BLOCK_NOT_FOUND);
  });

  it("bloqueio e agendamento simultâneos no mesmo horário: nunca os dois ativos", async () => {
    for (let round = 0; round < 8; round++) {
      const at = newDay();
      const patient = await newPatient();
      const [blockResult, bookingResult] = await Promise.all([
        outcome(insertScheduleBlock(client(), block(fisioA, at(9), at(12)), actorId)),
        outcome(insertAppointment(client(), booking(patient, fisioA, at(10), at(11)), actorId)),
      ]);
      // Exatamente um vence; o perdedor recebe a mensagem de regra (nunca erro 500).
      assert.equal(["ok" in blockResult, "ok" in bookingResult].filter(Boolean).length, 1, `rodada ${round}`);
      if ("ok" in blockResult) assert.deepEqual(bookingResult.failure, BLOCKED);
      else assert.equal(blockResult.failure?.conflicts?.length, 1);
      const blocks = await prisma.scheduleBlock.count({
        where: { professionalId: fisioA, removedAt: null, startsAt: { lt: at(12) }, endsAt: { gt: at(9) } },
      });
      const bookings = await prisma.appointment.count({
        where: { professionalId: fisioA, status: "AGENDADO", startsAt: { lt: at(12) }, endsAt: { gt: at(9) } },
      });
      assert.equal(blocks + bookings, 1);
    }
  });

  it("reagendamento e bloqueio simultâneos no destino: nunca os dois ativos", async () => {
    for (let round = 0; round < 5; round++) {
      const at = newDay();
      const id = await insertAppointment(prisma, booking(await newPatient(), fisioB, at(15), at(16)), actorId);
      const [blockResult, moveResult] = await Promise.all([
        outcome(insertScheduleBlock(client(), block(fisioA, at(9), at(12)), actorId)),
        outcome(moveAppointment(client(), id, { professionalId: fisioA, startsAt: at(10), endsAt: at(11) }, actorId)),
      ]);
      const moved = "ok" in moveResult && moveResult.ok === null;
      assert.notEqual("ok" in blockResult, moved, `rodada ${round}`);
    }
  });

  it("conflito do paciente: avisa com a lista, confirma e grava; cancelado e adjacente não avisam", async () => {
    const at = newDay();
    const patient = await newPatient();
    const first = await insertAppointment(prisma, booking(patient, fisioA, at(9), at(10)), actorId);

    const warned = await outcome(insertAppointment(prisma, booking(patient, fisioB, at(9, 30), at(10, 30)), actorId));
    assert.deepEqual(warned.failure?.patientConflicts?.map((item) => item.id), [first]);
    assert.match(warned.failure?.patientConflicts?.[0].label ?? "", /09:00–10:00 com FisioBloqA$/);
    assert.equal(await prisma.appointment.count({ where: { patientId: patient } }), 1);

    // Encaixe confirmado: grava.
    const confirmed = await insertAppointment(prisma, booking(patient, fisioB, at(9, 30), at(10, 30)), actorId, {
      allowPatientConflict: true,
    });
    assert.equal(typeof confirmed, "string");

    // Reagendar avisa, ignora o próprio agendamento, e segue com confirmação.
    const moveWarned = await outcome(
      moveAppointment(prisma, confirmed, { professionalId: fisioB, startsAt: at(9, 45), endsAt: at(10, 45) }, actorId),
    );
    assert.deepEqual(moveWarned.failure?.patientConflicts?.map((item) => item.id), [first]);
    assert.equal(
      await moveAppointment(prisma, confirmed, { professionalId: fisioB, startsAt: at(10), endsAt: at(11) }, actorId),
      null,
    );

    // Cancelado não conta; horário adjacente também não.
    assert.equal(await cancelAppointmentRecord(prisma, first, undefined, actorId), null);
    assert.equal(typeof (await insertAppointment(prisma, booking(patient, fisioA, at(9), at(10)), actorId)), "string");
    assert.equal(typeof (await insertAppointment(prisma, booking(patient, fisioA, at(11), at(12)), actorId)), "string");
  });

  it("CHECKs do banco: fim depois do início e remoção com data e autor juntos", async () => {
    const at = newDay();
    await assert.rejects(
      raw.query(
        `INSERT INTO "ScheduleBlock" ("id","professionalId","startsAt","endsAt","createdById") VALUES ($1,$2,$3,$3,$4)`,
        [`chk-${suffix}-1`, fisioA, at(9), actorId],
      ),
      /ScheduleBlock_ends_after_starts/,
    );
    await assert.rejects(
      raw.query(
        `INSERT INTO "ScheduleBlock" ("id","professionalId","startsAt","endsAt","createdById","removedAt") VALUES ($1,$2,$3,$4,$5,now())`,
        [`chk-${suffix}-2`, fisioA, at(9), at(10), actorId],
      ),
      /ScheduleBlock_removal_consistent/,
    );
  });
});
