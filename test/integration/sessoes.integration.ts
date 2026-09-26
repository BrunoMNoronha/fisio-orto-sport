// Integração com PostgreSQL real dos atendimentos (migração sessoes_atendimento): FKs compostas
// (plano do mesmo paciente, revisão do mesmo plano), idempotência, CHECKs de invalidação, Restrict e
// concorrência (encerramento do plano, correções, invalidação e inativação).
// Roda só com INTEGRATION_DATABASE_URL apontando para um banco DESCARTÁVEL já migrado.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ClinicoRuleError, PATIENT_INACTIVE_SESSION, assertPatientCanReceiveSession } from "@/modules/clinico/rules";

const url = process.env.INTEGRATION_DATABASE_URL;
describe("atendimentos no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let prisma: PrismaClient;
  let other: Client;
  let monitor: Client;
  let userId: string;
  const suffix = Date.now();
  let seq = 0;

  before(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    other = new Client({ connectionString: url });
    await other.connect();
    monitor = new Client({ connectionString: url });
    await monitor.connect();
    const user = await prisma.user.create({
      data: { name: "Fisio Sessão", email: `fisio-se-${suffix}@teste.local`, passwordHash: "x", role: "FISIOTERAPEUTA" },
    });
    userId = user.id;
  });

  after(async () => {
    await other?.end();
    await monitor?.end();
    await prisma?.$disconnect();
  });

  async function newPlan() {
    const patient = await prisma.patient.create({
      data: { fullName: "Paciente Sessão", birthDate: new Date("1990-01-01"), phone: "11999999999", createdById: userId, updatedById: userId },
      select: { id: true },
    });
    const anamnesis = await prisma.anamnesis.create({
      data: { patientId: patient.id, authorId: userId, authorNameSnapshot: "Fisio", assessmentDate: new Date("2026-09-01"), chiefComplaint: "Dor" },
    });
    const assessment = await prisma.assessment.create({
      data: { patientId: patient.id, anamnesisId: anamnesis.id, authorId: userId, authorNameSnapshot: "Fisio", assessmentDate: new Date("2026-09-01"), diagnosis: "Dx" },
    });
    const plan = await prisma.therapyPlan.create({
      data: {
        patientId: patient.id,
        assessmentId: assessment.id,
        assessmentVersion: 1,
        authorId: userId,
        authorNameSnapshot: "Fisio",
        revisions: {
          create: { number: 1, kind: "INICIAL", planDate: new Date("2026-09-02"), goals: "G", conduct: "C", authorId: userId, authorNameSnapshot: "Fisio" },
        },
      },
      select: { id: true, revisions: { select: { id: true } } },
    });
    return { patientId: patient.id, planId: plan.id, revisionId: plan.revisions[0].id };
  }

  const data = (ids: { patientId: string; planId: string; revisionId: string }, extra: Partial<Prisma.TreatmentSessionUncheckedCreateInput> = {}) => ({
    patientId: ids.patientId,
    planId: ids.planId,
    planRevisionId: ids.revisionId,
    occurredAt: new Date("2026-09-20T17:30:00Z"),
    professionalId: userId,
    professionalNameSnapshot: "Fisio Sessão",
    evolution: "Melhora",
    idempotencyKey: `k-${suffix}-${++seq}`,
    authorId: userId,
    authorNameSnapshot: "Fisio Sessão",
    ...extra,
  });

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

  it("FKs compostas: plano de outro paciente e revisão de outro plano são recusados", async () => {
    const a = await newPlan();
    const b = await newPlan();
    await assert.rejects(prisma.treatmentSession.create({ data: data({ ...a, planId: b.planId, revisionId: b.revisionId }) }), (e: unknown) =>
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003",
    );
    await assert.rejects(prisma.treatmentSession.create({ data: data({ ...a, revisionId: b.revisionId }) }), (e: unknown) =>
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003",
    );
    assert.equal(await prisma.treatmentSession.count({ where: { patientId: a.patientId } }), 0);
  });

  it("idempotência: a mesma chave não cria dois atendimentos", async () => {
    const ids = await newPlan();
    const payload = data(ids);
    await prisma.treatmentSession.create({ data: payload });
    await assert.rejects(prisma.treatmentSession.create({ data: payload }), (e: unknown) =>
      e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002",
    );
    assert.equal(await prisma.treatmentSession.count({ where: { patientId: ids.patientId } }), 1);
  });

  it("CHECKs: evolução vazia, invalidação incoerente e versão de correção < 2 são recusadas", async () => {
    const ids = await newPlan();
    await assert.rejects(prisma.treatmentSession.create({ data: data(ids, { evolution: "  " }) }));
    await assert.rejects(prisma.treatmentSession.create({ data: data(ids, { status: "INVALIDADO" }) }));
    await assert.rejects(prisma.treatmentSession.create({ data: data(ids, { invalidationReason: "x" }) }));
    const s = await prisma.treatmentSession.create({ data: data(ids) });
    await assert.rejects(
      prisma.treatmentSessionChange.create({
        data: { sessionId: s.id, version: 1, field: "evolution", reason: "r", editorId: userId, editorNameSnapshot: "Fisio" },
      }),
    );
    // Restrict: com histórico de correção, o atendimento não pode ser apagado (a aplicação nunca apaga).
    await prisma.treatmentSessionChange.create({
      data: { sessionId: s.id, version: 2, field: "evolution", reason: "r", editorId: userId, editorNameSnapshot: "Fisio" },
    });
    await assert.rejects(prisma.treatmentSession.delete({ where: { id: s.id } }));
  });

  it("nova revisão do plano não altera a revisão referenciada pelo atendimento", async () => {
    const ids = await newPlan();
    const s = await prisma.treatmentSession.create({ data: data(ids) });
    await prisma.therapyPlanRevision.create({
      data: { planId: ids.planId, number: 2, kind: "MUDANCA_CLINICA", reason: "m", planDate: new Date("2026-09-25"), goals: "G2", conduct: "C2", authorId: userId, authorNameSnapshot: "Fisio" },
    });
    await prisma.therapyPlan.update({ where: { id: ids.planId }, data: { currentRevision: 2 } });
    const stored = await prisma.treatmentSession.findUniqueOrThrow({
      where: { id: s.id },
      select: { planRevisionId: true, planRevision: { select: { number: true, conduct: true } } },
    });
    assert.equal(stored.planRevisionId, ids.revisionId);
    assert.deepEqual(stored.planRevision, { number: 1, conduct: "C" });
  });

  it("encerramento do plano espera o registro em curso (FOR SHARE) e vice-versa", async () => {
    const ids = await newPlan();
    // Um registro em curso segura o plano com FOR SHARE; o encerramento concorrente espera.
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => (locked = r));
    const creating = prisma.$transaction(async (tx) => {
      await assertPatientCanReceiveSession(tx, ids.patientId);
      const [plan] = await tx.$queryRaw<{ status: string }[]>`
        SELECT "status" FROM "TherapyPlan" WHERE "id" = ${ids.planId} AND "patientId" = ${ids.patientId} FOR SHARE`;
      assert.equal(plan.status, "ATIVO");
      locked();
      await hold;
      await tx.treatmentSession.create({ data: data(ids) });
    });
    await lockTaken;
    const closing = other.query(`UPDATE "TherapyPlan" SET status = 'ENCERRADO' WHERE id = $1`, [ids.planId]);
    await waitForLockWait();
    release();
    await creating;
    await closing;
    assert.equal(await prisma.treatmentSession.count({ where: { planId: ids.planId } }), 1);

    // Com o encerramento em curso, o registro espera e relê ENCERRADO.
    await prisma.therapyPlan.update({ where: { id: ids.planId }, data: { status: "ATIVO" } });
    await other.query("BEGIN");
    await other.query(`UPDATE "TherapyPlan" SET status = 'ENCERRADO' WHERE id = $1`, [ids.planId]);
    const reading = prisma.$queryRaw<{ status: string }[]>`
      SELECT "status" FROM "TherapyPlan" WHERE "id" = ${ids.planId} FOR SHARE`.then((rows) => rows[0].status);
    await waitForLockWait();
    await other.query("COMMIT");
    assert.equal(await reading, "ENCERRADO");
  });

  it("correção concorrente com a mesma versão (ou após invalidação) não sobrescreve", async () => {
    const ids = await newPlan();
    const { id } = await prisma.treatmentSession.create({ data: data(ids) });
    await other.query("BEGIN");
    await other.query(
      `UPDATE "TreatmentSession" SET status = 'INVALIDADO', "invalidationReason" = 'engano', "invalidatedAt" = now(),
         "invalidatedById" = $2, "invalidatedByNameSnapshot" = 'Fisio', version = version + 1
       WHERE id = $1 AND status = 'VALIDO'`,
      [id, userId],
    );
    const editing = prisma.treatmentSession
      .updateMany({ where: { id, version: 1, status: "VALIDO" }, data: { evolution: "Outra", version: 2 } })
      .then((result) => result);
    await waitForLockWait();
    await other.query("COMMIT");
    assert.equal((await editing).count, 0);
    const stored = await prisma.treatmentSession.findUniqueOrThrow({ where: { id }, select: { status: true, evolution: true } });
    assert.deepEqual(stored, { status: "INVALIDADO", evolution: "Melhora" });
  });

  it("inativação em curso bloqueia o registro, que relê INATIVO e é recusado", async () => {
    const ids = await newPlan();
    await other.query("BEGIN");
    await other.query(`UPDATE "Patient" SET status = 'INATIVO' WHERE id = $1`, [ids.patientId]);
    const pending = prisma
      .$transaction(async (tx) => {
        await assertPatientCanReceiveSession(tx, ids.patientId);
        await tx.treatmentSession.create({ data: data(ids) });
      })
      .then(
        () => "criou",
        (error: unknown) => error,
      );
    await waitForLockWait();
    await other.query("COMMIT");
    const outcome = await pending;
    assert.ok(outcome instanceof ClinicoRuleError);
    assert.equal(outcome.message, PATIENT_INACTIVE_SESSION);
    assert.equal(await prisma.treatmentSession.count({ where: { patientId: ids.patientId } }), 0);
  });
});
