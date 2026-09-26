// Integração com PostgreSQL real da agenda (issue #39): constraint Appointment_no_overlap e as
// transações de criar, reagendar e cancelar (service.ts, as mesmas usadas pelas actions) sob
// concorrência. Roda só com INTEGRATION_DATABASE_URL apontando para um banco DESCARTÁVEL já
// migrado; na CI a variável é obrigatória (a suíte falha em vez de ser pulada).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { AgendaRuleError, CONFLICT_MESSAGE, isOverlapViolation } from "@/modules/agenda/rules";
import {
  ALREADY_CANCELLED,
  cancelAppointmentRecord,
  insertAppointment,
  moveAppointment,
  ruleFailure,
} from "@/modules/agenda/service";

const url = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !url) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

const CONFLICT = { fieldErrors: { startTime: [CONFLICT_MESSAGE] } };

describe("agenda no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  // Vários clientes = instâncias diferentes da aplicação disputando o mesmo horário.
  const clients: PrismaClient[] = [];
  let prisma: PrismaClient;
  let other: Client;
  let monitor: Client;
  const suffix = Date.now();
  let actorId: string;
  let patientId: string;
  let fisioA: string;
  let fisioB: string;
  let day = 0;

  const client = () => {
    const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    clients.push(c);
    return c;
  };

  // Cada teste usa um dia próprio (no futuro distante), sem depender de dados existentes.
  function newDay() {
    const date = new Date(Date.UTC(2098, 0, 1));
    date.setUTCDate(date.getUTCDate() + ++day);
    return (hour: number, minute = 0) => new Date(date.getTime() + (hour * 60 + minute) * 60_000);
  }

  const booking = (professionalId: string, startsAt: Date, endsAt: Date) => ({
    patientId,
    professionalId,
    startsAt,
    endsAt,
    notes: null,
  });

  // Converte a rejeição na resposta que a action mostraria (ou relança o inesperado).
  async function outcome<T>(promise: Promise<T>) {
    try {
      return { ok: await promise };
    } catch (error) {
      const failure = ruleFailure(error);
      if (!failure) throw error;
      return { failure, error };
    }
  }

  async function activeIn(professionalId: string, from: Date, to: Date) {
    return prisma.appointment.findMany({
      where: { professionalId, status: "AGENDADO", startsAt: { lt: to }, endsAt: { gt: from } },
      select: { id: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: "asc" },
    });
  }

  async function waitForLockWait() {
    for (let i = 0; i < 100; i++) {
      const { rows } = await monitor.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`,
      );
      if (rows[0].n > 0) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("Nenhuma sessão ficou aguardando lock.");
  }

  before(async () => {
    prisma = client();
    other = new Client({ connectionString: url });
    await other.connect();
    monitor = new Client({ connectionString: url });
    await monitor.connect();
    const user = (name: string, role: "FISIOTERAPEUTA" | "RECEPCAO") =>
      prisma.user.create({
        data: { name, email: `${name.toLowerCase()}-${suffix}@teste.local`, passwordHash: "x", role },
        select: { id: true },
      });
    actorId = (await user("Recepcao", "RECEPCAO")).id;
    fisioA = (await user("FisioA", "FISIOTERAPEUTA")).id;
    fisioB = (await user("FisioB", "FISIOTERAPEUTA")).id;
    const patient = await prisma.patient.create({
      data: { fullName: "Paciente Agenda", birthDate: new Date("1990-01-01"), phone: "11999999999", createdById: actorId, updatedById: actorId },
      select: { id: true },
    });
    patientId = patient.id;
  });

  after(async () => {
    await other?.end();
    await monitor?.end();
    await Promise.all(clients.map((c) => c.$disconnect()));
  });

  it("sobreposição do mesmo profissional é recusada; horários adjacentes são aceitos", async () => {
    const at = newDay();
    await insertAppointment(prisma, booking(fisioA, at(9), at(10)), actorId);
    // Adjacentes nos dois lados: intervalo semiaberto [início, fim).
    await insertAppointment(prisma, booking(fisioA, at(10), at(11)), actorId);
    await insertAppointment(prisma, booking(fisioA, at(8), at(9)), actorId);

    for (const [start, end] of [
      [at(9, 30), at(10, 30)],
      [at(8, 30), at(9, 30)],
      [at(9, 15), at(9, 45)],
      [at(8), at(11)],
    ]) {
      const result = await outcome(insertAppointment(prisma, booking(fisioA, start, end), actorId));
      assert.deepEqual(result.failure, CONFLICT);
      assert.ok(result.error instanceof AgendaRuleError);
    }
    assert.equal((await activeIn(fisioA, at(0), at(24))).length, 3);
  });

  it("a constraint barra a sobreposição mesmo sem a checagem da aplicação", async () => {
    const at = newDay();
    await insertAppointment(prisma, booking(fisioA, at(9), at(10)), actorId);
    const direct = prisma.appointment.create({
      data: { ...booking(fisioA, at(9, 30), at(10, 30)), createdById: actorId, updatedById: actorId },
    });
    await assert.rejects(direct, (error: unknown) => {
      assert.ok(isOverlapViolation(error), `esperado 23P01: ${error}`);
      assert.deepEqual(ruleFailure(error), CONFLICT);
      return true;
    });
    // Cancelado não ocupa horário, nem para a constraint.
    await prisma.appointment.updateMany({
      where: { professionalId: fisioA, startsAt: at(9) },
      data: { status: "CANCELADO", cancelledAt: new Date() },
    });
    await prisma.appointment.create({
      data: { ...booking(fisioA, at(9, 30), at(10, 30)), createdById: actorId, updatedById: actorId },
    });
  });

  it("corrida real: a transação que perde para a constraint recebe a mensagem de conflito e não grava nada", async () => {
    const at = newDay();
    // Outra transação insere o mesmo horário e segura o commit: a checagem da aplicação não vê
    // a linha ainda não confirmada, e o INSERT fica esperando a constraint.
    await other.query("BEGIN");
    await other.query(
      `INSERT INTO "Appointment" (id, "patientId", "professionalId", "startsAt", "endsAt", "createdById", "updatedById", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $6, now())`,
      [`race-${suffix}-${day}`, patientId, fisioA, at(9), at(10), actorId],
    );
    const loser = outcome(insertAppointment(client(), booking(fisioA, at(9, 30), at(10, 30)), actorId));
    await waitForLockWait();
    await other.query("COMMIT");
    const result = await loser;
    assert.deepEqual(result.failure, CONFLICT);
    assert.ok(isOverlapViolation(result.error));
    const persisted = await activeIn(fisioA, at(0), at(24));
    assert.deepEqual(persisted.map((row) => row.id), [`race-${suffix}-${day}`]);
  });

  it("criações simultâneas de várias instâncias deixam um único agendamento (repetido)", async () => {
    const instances = [prisma, client(), client(), client()];
    for (let round = 0; round < 5; round++) {
      const at = newDay();
      // Horários diferentes, mas todos sobrepostos entre si.
      const results = await Promise.all(
        instances.flatMap((db, i) => [
          outcome(insertAppointment(db, booking(fisioA, at(9, i * 5), at(10, i * 5)), actorId)),
          outcome(insertAppointment(db, booking(fisioA, at(9), at(10)), actorId)),
        ]),
      );
      const winners = results.filter((result) => "ok" in result);
      assert.equal(winners.length, 1, `rodada ${round}: ${winners.length} vencedores`);
      // Com o lock por profissional, todo perdedor recebe a mensagem de conflito (sem deadlock/500).
      for (const result of results) if ("failure" in result) assert.deepEqual(result.failure, CONFLICT);
      assert.equal((await activeIn(fisioA, at(0), at(24))).length, 1);
    }
  });

  it("reagendamentos simultâneos para o mesmo horário: só um move, o outro fica onde estava (repetido)", async () => {
    for (let round = 0; round < 5; round++) {
      const at = newDay();
      const first = await insertAppointment(prisma, booking(fisioA, at(8), at(9)), actorId);
      const second = await insertAppointment(prisma, booking(fisioA, at(14), at(15)), actorId);
      const target = { professionalId: fisioA, startsAt: at(11), endsAt: at(12) };
      const results = await Promise.all([
        outcome(moveAppointment(prisma, first, target, actorId)),
        outcome(moveAppointment(client(), second, target, actorId)),
      ]);
      const moved = results.filter((result) => "ok" in result && result.ok === null);
      assert.equal(moved.length, 1, `rodada ${round}`);
      const loser = results.find((result) => "failure" in result);
      assert.deepEqual(loser && "failure" in loser ? loser.failure : null, CONFLICT);

      const rows = await activeIn(fisioA, at(0), at(24));
      assert.equal(rows.length, 2);
      assert.equal(rows.filter((row) => row.startsAt.getTime() === at(11).getTime()).length, 1);
      // Rollback do perdedor: continua no horário original.
      const stayed = rows.find((row) => row.startsAt.getTime() !== at(11).getTime());
      assert.ok(stayed && [at(8).getTime(), at(14).getTime()].includes(stayed.startsAt.getTime()));
    }
  });

  it("reagendar para horário que sobrepõe só o próprio agendamento é permitido", async () => {
    const at = newDay();
    const id = await insertAppointment(prisma, booking(fisioA, at(9), at(10)), actorId);
    assert.equal(await moveAppointment(prisma, id, { professionalId: fisioA, startsAt: at(9, 30), endsAt: at(10, 30) }, actorId), null);
    const occupied = await insertAppointment(prisma, booking(fisioA, at(13), at(14)), actorId);
    const result = await outcome(moveAppointment(prisma, occupied, { professionalId: fisioA, startsAt: at(10), endsAt: at(11) }, actorId));
    assert.deepEqual(result.failure, CONFLICT);
    const unchanged = await prisma.appointment.findUniqueOrThrow({ where: { id: occupied } });
    assert.equal(unchanged.startsAt.getTime(), at(13).getTime());
  });

  it("cancelamento libera o horário e não pode ser repetido nem reagendado", async () => {
    const at = newDay();
    const id = await insertAppointment(prisma, booking(fisioA, at(9), at(10)), actorId);
    assert.deepEqual((await outcome(insertAppointment(prisma, booking(fisioA, at(9), at(10)), actorId))).failure, CONFLICT);
    assert.equal(await cancelAppointmentRecord(prisma, id, "Paciente pediu", actorId), null);
    const cancelled = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    assert.equal(cancelled.status, "CANCELADO");
    assert.equal(cancelled.cancelledById, actorId);

    await insertAppointment(prisma, booking(fisioA, at(9), at(10)), actorId);
    assert.deepEqual(await cancelAppointmentRecord(prisma, id, undefined, actorId), { error: "Agendamento já está cancelado." });
    assert.deepEqual(await moveAppointment(prisma, id, { professionalId: fisioA, startsAt: at(15), endsAt: at(16) }, actorId), ALREADY_CANCELLED);
  });

  it("reagendamentos cruzados entre dois profissionais em paralelo não travam (ordem fixa dos locks)", async () => {
    for (let round = 0; round < 5; round++) {
      const at = newDay();
      const fromA = await insertAppointment(prisma, booking(fisioA, at(8), at(9)), actorId);
      const fromB = await insertAppointment(prisma, booking(fisioB, at(8), at(9)), actorId);
      const results = await Promise.all([
        outcome(moveAppointment(prisma, fromA, { professionalId: fisioB, startsAt: at(11), endsAt: at(12) }, actorId)),
        outcome(moveAppointment(client(), fromB, { professionalId: fisioA, startsAt: at(11), endsAt: at(12) }, actorId)),
      ]);
      assert.deepEqual(results, [{ ok: null }, { ok: null }]);
    }
  });

  it("cancelamentos simultâneos do mesmo agendamento: um cancela, o outro é informado", async () => {
    const at = newDay();
    const id = await insertAppointment(prisma, booking(fisioA, at(9), at(10)), actorId);
    const results = await Promise.all([
      cancelAppointmentRecord(prisma, id, undefined, actorId),
      cancelAppointmentRecord(client(), id, undefined, actorId),
    ]);
    assert.deepEqual(results.filter((result) => result === null).length, 1);
    assert.ok(results.some((result) => result?.error === "Agendamento já está cancelado."));
  });

  it("profissionais distintos são independentes, inclusive em paralelo", async () => {
    const at = newDay();
    const results = await Promise.all([
      outcome(insertAppointment(prisma, booking(fisioA, at(9), at(10)), actorId)),
      outcome(insertAppointment(client(), booking(fisioB, at(9), at(10)), actorId)),
    ]);
    assert.ok(results.every((result) => "ok" in result));
    assert.equal((await activeIn(fisioA, at(0), at(24))).length, 1);
    assert.equal((await activeIn(fisioB, at(0), at(24))).length, 1);

    // Reagendar de um profissional para outro respeita a agenda do destino.
    const moving = await insertAppointment(prisma, booking(fisioA, at(14), at(15)), actorId);
    const result = await outcome(moveAppointment(prisma, moving, { professionalId: fisioB, startsAt: at(9, 30), endsAt: at(10, 30) }, actorId));
    assert.deepEqual(result.failure, CONFLICT);
    assert.equal(await moveAppointment(prisma, moving, { professionalId: fisioB, startsAt: at(10), endsAt: at(11) }, actorId), null);
  });
});
