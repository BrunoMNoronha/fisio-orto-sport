// Integração com PostgreSQL real do plano terapêutico (migração plano_terapeutico): FK composta com a
// avaliação do mesmo paciente, CHECKs das revisões, Restrict e concorrência (revisões e inativação).
// Roda só com INTEGRATION_DATABASE_URL apontando para um banco DESCARTÁVEL já migrado
// (os dados criados aqui não são limpos). Ver src/modules/clinico/README.md.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ClinicoRuleError, PATIENT_INACTIVE_PLAN, assertPatientCanReceivePlan } from "@/modules/clinico/rules";

const url = process.env.INTEGRATION_DATABASE_URL;
describe("plano terapêutico no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let prisma: PrismaClient;
  let other: Client;
  let monitor: Client;
  let authorId: string;
  const suffix = Date.now();

  before(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    other = new Client({ connectionString: url });
    await other.connect();
    monitor = new Client({ connectionString: url });
    await monitor.connect();
    const user = await prisma.user.create({
      data: { name: "Fisio Plano", email: `fisio-pl-${suffix}@teste.local`, passwordHash: "x", role: "FISIOTERAPEUTA" },
    });
    authorId = user.id;
  });

  after(async () => {
    await other?.end();
    await monitor?.end();
    await prisma?.$disconnect();
  });

  const signature = { authorId: "", authorNameSnapshot: "Fisio Plano" };
  const content = { planDate: new Date("2026-09-10"), goals: "Reduzir dor", conduct: "Cinesioterapia" };

  async function newPatientWithAssessment() {
    const patient = await prisma.patient.create({
      data: { fullName: "Paciente Plano", birthDate: new Date("1990-01-01"), phone: "11999999999", createdById: authorId, updatedById: authorId },
      select: { id: true },
    });
    const anamnesis = await prisma.anamnesis.create({
      data: { patientId: patient.id, authorId, authorNameSnapshot: "Fisio Plano", assessmentDate: new Date("2026-09-01"), chiefComplaint: "Dor" },
      select: { id: true },
    });
    const assessment = await prisma.assessment.create({
      data: {
        patientId: patient.id,
        anamnesisId: anamnesis.id,
        authorId,
        authorNameSnapshot: "Fisio Plano",
        assessmentDate: new Date("2026-09-02"),
        diagnosis: "Tendinopatia",
      },
      select: { id: true },
    });
    return { patientId: patient.id, assessmentId: assessment.id };
  }

  const createPlan = (patientId: string, assessmentId: string) =>
    prisma.$transaction(async (tx) => {
      await assertPatientCanReceivePlan(tx, patientId);
      return tx.therapyPlan.create({
        data: {
          patientId,
          assessmentId,
          assessmentVersion: 1,
          ...signature,
          authorId,
          revisions: { create: { number: 1, kind: "INICIAL", ...content, ...signature, authorId } },
        },
        select: { id: true },
      });
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

  it("a FK composta recusa avaliação de outro paciente", async () => {
    const a = await newPatientWithAssessment();
    const b = await newPatientWithAssessment();
    const error = await createPlan(a.patientId, b.assessmentId).then(
      () => null,
      (caught: unknown) => caught,
    );
    assert.ok(error instanceof Prisma.PrismaClientKnownRequestError);
    assert.equal(error.code, "P2003");
    assert.equal(await prisma.therapyPlan.count({ where: { patientId: a.patientId } }), 0);
  });

  it("CHECKs das revisões: INICIAL só na 1ª e sem motivo; demais com motivo; quantidade 1–100", async () => {
    const { patientId, assessmentId } = await newPatientWithAssessment();
    const { id: planId } = await createPlan(patientId, assessmentId);
    const revision = (data: Partial<Prisma.TherapyPlanRevisionUncheckedCreateInput>) =>
      prisma.therapyPlanRevision.create({
        data: { planId, number: 2, kind: "CORRECAO", reason: "Erro", ...content, ...signature, authorId, ...data },
      });
    await assert.rejects(revision({ kind: "INICIAL", reason: null }));
    await assert.rejects(revision({ reason: null }));
    await assert.rejects(revision({ reason: "  " }));
    await assert.rejects(revision({ plannedSessions: 0 }));
    await assert.rejects(revision({ plannedSessions: 101 }));
    await assert.rejects(revision({ conduct: " " }));
    await revision({ plannedSessions: 100 });
    // Número repetido é barrado pela unicidade (planId, number).
    await assert.rejects(revision({ kind: "MUDANCA_CLINICA" }));
  });

  it("avaliação, plano e revisões referenciados não podem ser apagados (Restrict)", async () => {
    const { patientId, assessmentId } = await newPatientWithAssessment();
    const { id: planId } = await createPlan(patientId, assessmentId);
    await assert.rejects(prisma.assessment.delete({ where: { id: assessmentId } }));
    await assert.rejects(prisma.therapyPlan.delete({ where: { id: planId } }));
  });

  it("editar a avaliação depois não muda a origem registrada no plano", async () => {
    const { patientId, assessmentId } = await newPatientWithAssessment();
    const { id } = await createPlan(patientId, assessmentId);
    await prisma.assessment.update({ where: { id: assessmentId }, data: { diagnosis: "Outro", version: 2 } });
    const plan = await prisma.therapyPlan.findUniqueOrThrow({
      where: { id },
      select: { assessmentVersion: true, revisions: { select: { goals: true } } },
    });
    assert.equal(plan.assessmentVersion, 1);
    assert.deepEqual(plan.revisions, [{ goals: "Reduzir dor" }]);
  });

  it("revisões concorrentes da mesma base: só a primeira grava", async () => {
    const { patientId, assessmentId } = await newPatientWithAssessment();
    const { id } = await createPlan(patientId, assessmentId);

    await other.query("BEGIN");
    await other.query(`UPDATE "TherapyPlan" SET "currentRevision" = 2 WHERE id = $1 AND "currentRevision" = 1 AND status = 'ATIVO'`, [id]);

    const second = prisma.therapyPlan
      .updateMany({ where: { id, currentRevision: 1, status: "ATIVO" }, data: { currentRevision: 2 } })
      .then((result) => result);
    await waitForLockWait();
    await other.query("COMMIT");
    assert.equal((await second).count, 0);
  });

  it("encerramento concorrente impede a revisão (mesma linha, condição de estado)", async () => {
    const { patientId, assessmentId } = await newPatientWithAssessment();
    const { id } = await createPlan(patientId, assessmentId);

    await other.query("BEGIN");
    await other.query(`UPDATE "TherapyPlan" SET status = 'ENCERRADO' WHERE id = $1 AND status = 'ATIVO'`, [id]);
    const revising = prisma.therapyPlan
      .updateMany({ where: { id, currentRevision: 1, status: "ATIVO" }, data: { currentRevision: 2 } })
      .then((result) => result);
    await waitForLockWait();
    await other.query("COMMIT");
    assert.equal((await revising).count, 0);
  });

  it("inativação em curso bloqueia a criação do plano, que relê INATIVO e é recusada", async () => {
    const { patientId, assessmentId } = await newPatientWithAssessment();
    await other.query("BEGIN");
    await other.query(`UPDATE "Patient" SET status = 'INATIVO' WHERE id = $1`, [patientId]);
    const pending = createPlan(patientId, assessmentId).then(
      () => "criou",
      (error: unknown) => error,
    );
    await waitForLockWait();
    await other.query("COMMIT");

    const outcome = await pending;
    assert.ok(outcome instanceof ClinicoRuleError);
    assert.equal(outcome.message, PATIENT_INACTIVE_PLAN);
    assert.equal(await prisma.therapyPlan.count({ where: { patientId } }), 0);
  });

  it("mudança de estado exige estados diferentes e motivo", async () => {
    const { patientId, assessmentId } = await newPatientWithAssessment();
    const { id: planId } = await createPlan(patientId, assessmentId);
    const change = { planId, fromStatus: "ATIVO" as const, toStatus: "ENCERRADO" as const, reason: "Alta", ...signature, authorId };
    await prisma.therapyPlanStatusChange.create({ data: change });
    await assert.rejects(prisma.therapyPlanStatusChange.create({ data: { ...change, toStatus: "ATIVO", fromStatus: "ATIVO" } }));
    await assert.rejects(prisma.therapyPlanStatusChange.create({ data: { ...change, reason: " " } }));
  });
});
