// Integração com PostgreSQL real do vínculo agenda–sessão e da presença (MEL-01, #44; migração
// agenda_sessao_presenca): FK composta (agendamento do mesmo paciente), índice único parcial (um
// atendimento VÁLIDO por agendamento), CHECK de presença, Restrict e concorrência entre gerar
// atendimento, reenviar, cancelar e marcar presença. Usa as mesmas funções das actions
// (agenda/service.ts e clinico/session-appointment.ts). Roda só com INTEGRATION_DATABASE_URL
// apontando para um banco DESCARTÁVEL já migrado; na CI a variável é obrigatória.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  HAS_ATTENDANCE,
  HAS_SESSION,
  ATTENDANCE_LOCKED,
  cancelAppointmentRecord,
  moveAppointment,
  setAttendanceRecord,
} from "@/modules/agenda/service";
import {
  AppointmentLinkError,
  isAppointmentLinkConflict,
  lockAppointmentForSession,
  markAttendedBySession,
} from "@/modules/clinico/session-appointment";
import { APPOINTMENT_SESSION_MESSAGES } from "@/modules/clinico/session-validation";

const url = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !url) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

describe("vínculo agenda–sessão no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  const clients: PrismaClient[] = [];
  let prisma: PrismaClient;
  let other: Client;
  let monitor: Client;
  let userId: string;
  const suffix = Date.now();
  let seq = 0;
  let slot = 0;

  // application_name identifica as conexões desta suíte na contagem de esperas por lock (os arquivos
  // de integração rodam em paralelo no mesmo banco).
  const APP = `mel01-${process.pid}`;
  const tagged = () => `${url}${url!.includes("?") ? "&" : "?"}application_name=${APP}`;
  const client = () => {
    const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: tagged() }) });
    clients.push(c);
    return c;
  };

  before(async () => {
    prisma = client();
    other = new Client({ connectionString: url });
    await other.connect();
    monitor = new Client({ connectionString: url });
    await monitor.connect();
    const user = await prisma.user.create({
      data: { name: "Fisio Vínculo", email: `fisio-vinc-${suffix}@teste.local`, passwordHash: "x", role: "FISIOTERAPEUTA" },
    });
    userId = user.id;
  });

  after(async () => {
    await other?.end();
    await monitor?.end();
    await Promise.all(clients.map((c) => c.$disconnect()));
  });

  // Paciente com plano ativo e um agendamento já iniciado (horário próprio, sem conflito).
  async function scenario() {
    const patient = await prisma.patient.create({
      data: { fullName: "Paciente Vínculo", birthDate: new Date("1990-01-01"), phone: "11999999999", createdById: userId, updatedById: userId },
      select: { id: true },
    });
    const anamnesis = await prisma.anamnesis.create({
      data: { patientId: patient.id, authorId: userId, authorNameSnapshot: "Fisio", assessmentDate: new Date("2026-01-01"), chiefComplaint: "Dor" },
    });
    const assessment = await prisma.assessment.create({
      data: { patientId: patient.id, anamnesisId: anamnesis.id, authorId: userId, authorNameSnapshot: "Fisio", assessmentDate: new Date("2026-01-01"), diagnosis: "Dx" },
    });
    const plan = await prisma.therapyPlan.create({
      data: {
        patientId: patient.id,
        assessmentId: assessment.id,
        assessmentVersion: 1,
        authorId: userId,
        authorNameSnapshot: "Fisio",
        revisions: {
          create: { number: 1, kind: "INICIAL", planDate: new Date("2026-01-02"), goals: "G", conduct: "C", authorId: userId, authorNameSnapshot: "Fisio" },
        },
      },
      select: { id: true, revisions: { select: { id: true } } },
    });
    const startsAt = new Date(Date.UTC(2026, 0, 5, 8) + ++slot * 60 * 60_000);
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        professionalId: userId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60_000),
        createdById: userId,
        updatedById: userId,
      },
      select: { id: true },
    });
    return { patientId: patient.id, planId: plan.id, revisionId: plan.revisions[0].id, appointmentId: appointment.id, startsAt };
  }

  type Scenario = Awaited<ReturnType<typeof scenario>>;

  const sessionData = (s: Scenario, extra: Partial<Prisma.TreatmentSessionUncheckedCreateInput> = {}) => ({
    patientId: s.patientId,
    planId: s.planId,
    planRevisionId: s.revisionId,
    appointmentId: s.appointmentId,
    occurredAt: s.startsAt,
    professionalId: userId,
    professionalNameSnapshot: "Fisio Vínculo",
    evolution: "Melhora",
    idempotencyKey: `vinc-${suffix}-${++seq}`,
    authorId: userId,
    authorNameSnapshot: "Fisio Vínculo",
    ...extra,
  });

  // Mesmo caminho da action createSession com agendamento: trava, valida, cria e marca presença.
  async function generate(db: PrismaClient, s: Scenario, requestId: string) {
    return db.$transaction(async (tx) => {
      const { existingId } = await lockAppointmentForSession(tx, {
        appointmentId: s.appointmentId,
        patientId: s.patientId,
        professionalId: userId,
        requestId,
      });
      if (existingId) return existingId;
      const created = await tx.treatmentSession.create({
        data: sessionData(s, { idempotencyKey: requestId }),
        select: { id: true },
      });
      await markAttendedBySession(tx, s.appointmentId, userId);
      return created.id;
    });
  }

  async function waitForLockWaiters(n: number) {
    for (let i = 0; i < 200; i++) {
      const { rows } = await monitor.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
         WHERE wait_event_type = 'Lock' AND datname = current_database() AND application_name = $1`,
        [APP],
      );
      if (rows[0].n >= n) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Menos de ${n} sessões ficaram aguardando lock.`);
  }

  // Segura a linha do agendamento numa conexão à parte até `release()`.
  async function holdAppointment(appointmentId: string) {
    await other.query("BEGIN");
    await other.query(`SELECT 1 FROM "Appointment" WHERE "id" = $1 FOR UPDATE`, [appointmentId]);
    return () => other.query("COMMIT");
  }

  const isP = (code: string) => (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;

  it("FK composta: atendimento não aponta para agendamento de outro paciente", async () => {
    const a = await scenario();
    const b = await scenario();
    await assert.rejects(prisma.treatmentSession.create({ data: sessionData(a, { appointmentId: b.appointmentId }) }), isP("P2003"));
    assert.equal(await prisma.treatmentSession.count({ where: { patientId: a.patientId } }), 0);
  });

  it("índice único parcial: um atendimento VÁLIDO por agendamento; invalidar libera", async () => {
    const s = await scenario();
    const first = await prisma.treatmentSession.create({ data: sessionData(s) });
    await assert.rejects(prisma.treatmentSession.create({ data: sessionData(s) }), (e: unknown) => isAppointmentLinkConflict(e));
    await prisma.treatmentSession.update({
      where: { id: first.id },
      data: { status: "INVALIDADO", invalidationReason: "Engano", invalidatedAt: new Date(), invalidatedById: userId, invalidatedByNameSnapshot: "Fisio" },
    });
    await prisma.treatmentSession.create({ data: sessionData(s) });
    assert.equal(await prisma.treatmentSession.count({ where: { appointmentId: s.appointmentId } }), 2);
    assert.equal(await prisma.treatmentSession.count({ where: { appointmentId: s.appointmentId, status: "VALIDO" } }), 1);
  });

  it("atendimentos sem vínculo (legados e retroativos) não são limitados pelo índice", async () => {
    const s = await scenario();
    await prisma.treatmentSession.create({ data: sessionData(s, { appointmentId: null }) });
    await prisma.treatmentSession.create({ data: sessionData(s, { appointmentId: null }) });
    assert.equal(await prisma.treatmentSession.count({ where: { patientId: s.patientId, appointmentId: null } }), 2);
  });

  it("Restrict: agendamento com atendimento vinculado não é excluído", async () => {
    const s = await scenario();
    await prisma.treatmentSession.create({ data: sessionData(s) });
    await assert.rejects(prisma.appointment.delete({ where: { id: s.appointmentId } }));
    assert.ok(await prisma.appointment.findUnique({ where: { id: s.appointmentId } }));
  });

  it("CHECK de presença: campos juntos e só em agendamento AGENDADO", async () => {
    const s = await scenario();
    await assert.rejects(prisma.appointment.update({ where: { id: s.appointmentId }, data: { attendance: "COMPARECEU" } }));
    await prisma.appointment.update({
      where: { id: s.appointmentId },
      data: { attendance: "FALTA_AVISADA", attendanceMarkedAt: new Date(), attendanceMarkedById: userId },
    });
    await assert.rejects(
      prisma.appointment.update({
        where: { id: s.appointmentId },
        data: { status: "CANCELADO", cancelledAt: new Date(), cancelledById: userId },
      }),
    );
    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: s.appointmentId } });
    assert.equal(stored.status, "AGENDADO");
    assert.equal(stored.attendance, "FALTA_AVISADA");
  });

  it("gerar atendimento marca comparecimento; presença, cancelar e reagendar ficam travados até invalidar", async () => {
    const s = await scenario();
    const id = await generate(prisma, s, `gen-${suffix}-${++seq}`);
    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: s.appointmentId } });
    assert.equal(appointment.attendance, "COMPARECEU");
    assert.equal(appointment.attendanceMarkedById, userId);

    assert.deepEqual(await setAttendanceRecord(prisma, s.appointmentId, "FALTA_AVISADA", userId), ATTENDANCE_LOCKED);
    assert.deepEqual(await cancelAppointmentRecord(prisma, s.appointmentId, null, userId), HAS_SESSION);
    const later = new Date(s.startsAt.getTime() + 24 * 60 * 60_000);
    assert.deepEqual(
      await moveAppointment(prisma, s.appointmentId, { professionalId: userId, startsAt: later, endsAt: new Date(later.getTime() + 3600_000) }, userId),
      HAS_SESSION,
    );

    // Invalidado o atendimento, a presença continua marcada e ainda impede cancelar até ser removida.
    await prisma.treatmentSession.update({
      where: { id },
      data: { status: "INVALIDADO", invalidationReason: "Engano", invalidatedAt: new Date(), invalidatedById: userId, invalidatedByNameSnapshot: "Fisio" },
    });
    assert.deepEqual(await cancelAppointmentRecord(prisma, s.appointmentId, null, userId), HAS_ATTENDANCE);
    assert.equal(await setAttendanceRecord(prisma, s.appointmentId, null, userId), null);
    assert.equal(await cancelAppointmentRecord(prisma, s.appointmentId, "Remarcar", userId), null);
    const cancelled = await prisma.appointment.findUniqueOrThrow({ where: { id: s.appointmentId } });
    assert.equal(cancelled.status, "CANCELADO");
    assert.equal(cancelled.attendance, null);
  });

  it("falta marcada impede gerar atendimento; presença antes do início é recusada", async () => {
    const s = await scenario();
    await setAttendanceRecord(prisma, s.appointmentId, "FALTA_NAO_AVISADA", userId);
    await assert.rejects(generate(prisma, s, `gen-${suffix}-${++seq}`), (e: unknown) =>
      e instanceof AppointmentLinkError && e.message === APPOINTMENT_SESSION_MESSAGES.absent,
    );
    const early = await setAttendanceRecord(prisma, s.appointmentId, "COMPARECEU", userId, new Date(s.startsAt.getTime() - 60_000));
    assert.match(early?.error ?? "", /a partir do início do horário/);
    assert.equal(await prisma.treatmentSession.count({ where: { appointmentId: s.appointmentId } }), 0);
  });

  it("concorrência: dois registros simultâneos do mesmo agendamento geram um só atendimento", async () => {
    const s = await scenario();
    const release = await holdAppointment(s.appointmentId);
    const attempts = [client(), client()].map((db, i) => generate(db, s, `par-${suffix}-${i}`));
    await waitForLockWaiters(2);
    await release();
    const results = await Promise.allSettled(attempts);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(failed.length, 1);
    assert.ok(failed[0].reason instanceof AppointmentLinkError);
    assert.equal(failed[0].reason.message, APPOINTMENT_SESSION_MESSAGES.linked);
    assert.equal(await prisma.treatmentSession.count({ where: { appointmentId: s.appointmentId } }), 1);
  });

  it("concorrência: reenvio simultâneo do mesmo formulário devolve o mesmo atendimento", async () => {
    const s = await scenario();
    const requestId = `reenvio-${suffix}`;
    const release = await holdAppointment(s.appointmentId);
    const attempts = [client(), client()].map((db) => generate(db, s, requestId));
    await waitForLockWaiters(2);
    await release();
    const [a, b] = await Promise.all(attempts);
    assert.equal(a, b);
    assert.equal(await prisma.treatmentSession.count({ where: { appointmentId: s.appointmentId } }), 1);
  });

  it("concorrência: gerar atendimento e cancelar ao mesmo tempo nunca terminam os dois", async () => {
    // A ordem de chegada na fila do lock decide quem vence; as duas ordens são exercitadas.
    for (const cancelFirst of [true, false]) {
      const s = await scenario();
      const release = await holdAppointment(s.appointmentId);
      const startCancel = () => cancelAppointmentRecord(client(), s.appointmentId, null, userId);
      const startGen = () =>
        generate(client(), s, `corrida-${suffix}-${++seq}`).then(
          (id) => ({ id }),
          (error: unknown) => ({ error }),
        );
      let cancel: ReturnType<typeof startCancel>;
      let gen: ReturnType<typeof startGen>;
      if (cancelFirst) {
        cancel = startCancel();
        await waitForLockWaiters(1);
        gen = startGen();
      } else {
        gen = startGen();
        await waitForLockWaiters(1);
        cancel = startCancel();
      }
      await waitForLockWaiters(2);
      await release();
      const [cancelled, generated] = await Promise.all([cancel, gen]);
      const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: s.appointmentId } });
      const count = await prisma.treatmentSession.count({ where: { appointmentId: s.appointmentId, status: "VALIDO" } });
      if (cancelFirst) {
        assert.equal(cancelled, null);
        assert.equal(appointment.status, "CANCELADO");
        assert.ok("error" in generated && generated.error instanceof AppointmentLinkError);
        assert.equal((generated.error as Error).message, APPOINTMENT_SESSION_MESSAGES.cancelled);
        assert.equal(count, 0);
      } else {
        assert.deepEqual(cancelled, HAS_SESSION);
        assert.ok("id" in generated);
        assert.equal(appointment.status, "AGENDADO");
        assert.equal(appointment.attendance, "COMPARECEU");
        assert.equal(count, 1);
      }
    }
  });

  it("concorrência: marcar falta e gerar atendimento ao mesmo tempo ficam coerentes", async () => {
    const s = await scenario();
    const release = await holdAppointment(s.appointmentId);
    const mark = setAttendanceRecord(client(), s.appointmentId, "FALTA_AVISADA", userId);
    const gen = generate(client(), s, `falta-${suffix}-${++seq}`).then(
      (id) => ({ id }),
      (error: unknown) => ({ error }),
    );
    await waitForLockWaiters(2);
    await release();
    const [marked, generated] = await Promise.all([mark, gen]);
    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: s.appointmentId } });
    const count = await prisma.treatmentSession.count({ where: { appointmentId: s.appointmentId, status: "VALIDO" } });
    if ("id" in generated) {
      assert.equal(count, 1);
      assert.equal(appointment.attendance, "COMPARECEU");
      assert.deepEqual(marked, ATTENDANCE_LOCKED);
    } else {
      assert.equal(count, 0);
      assert.equal(appointment.attendance, "FALTA_AVISADA");
      assert.equal(marked, null);
    }
  });
});
