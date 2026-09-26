// Integração com PostgreSQL real da avaliação inicial (migração avaliacao_inicial): FK composta com
// a anamnese do mesmo paciente, CHECKs, histórico preservado e concorrência (inativação e edições).
// Roda só com INTEGRATION_DATABASE_URL apontando para um banco DESCARTÁVEL já migrado
// (os dados criados aqui não são limpos). Ver src/modules/clinico/README.md.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ClinicoRuleError, PATIENT_INACTIVE_ASSESSMENT, assertPatientCanReceiveAssessment } from "@/modules/clinico/rules";

const url = process.env.INTEGRATION_DATABASE_URL;
describe("avaliação inicial no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
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
      data: {
        name: "Fisio Avaliação",
        email: `fisio-av-${suffix}@teste.local`,
        passwordHash: "x",
        role: "FISIOTERAPEUTA",
        crefito: `AV${suffix}`.slice(0, 20),
      },
    });
    authorId = user.id;
  });

  after(async () => {
    await other?.end();
    await monitor?.end();
    await prisma?.$disconnect();
  });

  async function newPatientWithAnamnesis() {
    const patient = await prisma.patient.create({
      data: { fullName: "Paciente Avaliação", birthDate: new Date("1990-01-01"), phone: "11999999999", createdById: authorId, updatedById: authorId },
      select: { id: true },
    });
    const anamnesis = await prisma.anamnesis.create({
      data: { patientId: patient.id, authorId, authorNameSnapshot: "Fisio Avaliação", assessmentDate: new Date("2026-09-01"), chiefComplaint: "Dor no ombro" },
      select: { id: true },
    });
    return { patientId: patient.id, anamnesisId: anamnesis.id };
  }

  const data = (patientId: string, anamnesisId: string) => ({
    patientId,
    anamnesisId,
    authorId,
    authorNameSnapshot: "Fisio Avaliação",
    authorCrefitoSnapshot: `AV${suffix}`.slice(0, 20),
    assessmentDate: new Date("2026-09-02"),
    diagnosis: "Tendinopatia do supraespinal",
  });

  const createAssessment = (patientId: string, anamnesisId: string) =>
    prisma.$transaction(async (tx) => {
      await assertPatientCanReceiveAssessment(tx, patientId);
      return tx.assessment.create({ data: data(patientId, anamnesisId), select: { id: true, version: true } });
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

  it("a FK composta recusa anamnese de outro paciente", async () => {
    const a = await newPatientWithAnamnesis();
    const b = await newPatientWithAnamnesis();
    const error = await prisma.assessment.create({ data: data(a.patientId, b.anamnesisId) }).then(
      () => null,
      (caught: unknown) => caught,
    );
    assert.ok(error instanceof Prisma.PrismaClientKnownRequestError);
    assert.equal(error.code, "P2003");
    assert.equal(await prisma.assessment.count({ where: { patientId: a.patientId } }), 0);
  });

  it("CHECKs: diagnóstico em branco e versão inválida são recusados pelo banco", async () => {
    const { patientId, anamnesisId } = await newPatientWithAnamnesis();
    await assert.rejects(prisma.assessment.create({ data: { ...data(patientId, anamnesisId), diagnosis: "   " } }));
    await assert.rejects(prisma.assessment.create({ data: { ...data(patientId, anamnesisId), version: 0 } }));
  });

  it("contexto e autoria históricos não mudam com nova anamnese nem com mudança de nome/CREFITO", async () => {
    const { patientId, anamnesisId } = await newPatientWithAnamnesis();
    const created = await createAssessment(patientId, anamnesisId);
    await prisma.anamnesis.create({
      data: { patientId, authorId, authorNameSnapshot: "Fisio Avaliação", assessmentDate: new Date("2026-09-10"), chiefComplaint: "Nova queixa" },
    });
    await prisma.user.update({ where: { id: authorId }, data: { name: "Nome Novo", crefito: `NV${suffix}`.slice(0, 20) } });

    const stored = await prisma.assessment.findUniqueOrThrow({
      where: { id: created.id },
      select: { anamnesisId: true, authorNameSnapshot: true, authorCrefitoSnapshot: true, anamnesis: { select: { chiefComplaint: true } } },
    });
    assert.equal(stored.anamnesisId, anamnesisId);
    assert.equal(stored.anamnesis.chiefComplaint, "Dor no ombro");
    assert.equal(stored.authorNameSnapshot, "Fisio Avaliação");
    assert.equal(stored.authorCrefitoSnapshot, `AV${suffix}`.slice(0, 20));
  });

  it("anamnese e avaliação referenciadas não podem ser apagadas (Restrict)", async () => {
    const { patientId, anamnesisId } = await newPatientWithAnamnesis();
    const created = await createAssessment(patientId, anamnesisId);
    await prisma.assessmentChange.create({
      data: { assessmentId: created.id, version: 2, field: "diagnosis", previousValue: "a", newValue: "b", editorId: authorId, editorNameSnapshot: "Fisio Avaliação" },
    });
    await assert.rejects(prisma.anamnesis.delete({ where: { id: anamnesisId } }));
    await assert.rejects(prisma.assessment.delete({ where: { id: created.id } }));
  });

  it("inativação em curso bloqueia a criação, que relê INATIVO e é recusada", async () => {
    const { patientId, anamnesisId } = await newPatientWithAnamnesis();
    await other.query("BEGIN");
    await other.query(`UPDATE "Patient" SET status = 'INATIVO' WHERE id = $1`, [patientId]);
    const pending = createAssessment(patientId, anamnesisId).then(
      () => "criou",
      (error: unknown) => error,
    );
    await waitForLockWait();
    await other.query("COMMIT");

    const outcome = await pending;
    assert.ok(outcome instanceof ClinicoRuleError);
    assert.equal(outcome.message, PATIENT_INACTIVE_ASSESSMENT);
    assert.equal(await prisma.assessment.count({ where: { patientId } }), 0);
  });

  it("checagem otimista: a edição concorrente com a mesma versão não sobrescreve a primeira", async () => {
    const { patientId, anamnesisId } = await newPatientWithAnamnesis();
    const { id } = await createAssessment(patientId, anamnesisId);

    // A primeira edição (versão 1 → 2) segura a linha até o commit.
    await other.query("BEGIN");
    await other.query(`UPDATE "Assessment" SET diagnosis = 'Primeira', version = 2 WHERE id = $1 AND version = 1`, [id]);

    // A segunda, que também carregou a versão 1, espera o lock e, relida, não encontra mais a versão 1.
    // `.then` dispara a consulta agora (a PrismaPromise só executa quando consumida).
    const second = prisma.assessment
      .updateMany({ where: { id, version: 1 }, data: { diagnosis: "Segunda", version: 2 } })
      .then((result) => result);
    await waitForLockWait();
    await other.query("COMMIT");

    assert.equal((await second).count, 0);
    const stored = await prisma.assessment.findUniqueOrThrow({ where: { id }, select: { diagnosis: true, version: true } });
    assert.deepEqual(stored, { diagnosis: "Primeira", version: 2 });
  });

  it("histórico: um campo por edição (único por versão) e versão de edição sempre ≥ 2", async () => {
    const { patientId, anamnesisId } = await newPatientWithAnamnesis();
    const { id } = await createAssessment(patientId, anamnesisId);
    const change = { assessmentId: id, version: 2, field: "diagnosis", editorId: authorId, editorNameSnapshot: "Fisio Avaliação" };
    await prisma.assessmentChange.create({ data: change });
    await assert.rejects(prisma.assessmentChange.create({ data: change }));
    await assert.rejects(prisma.assessmentChange.create({ data: { ...change, version: 1, field: "palpation" } }));
  });
});
