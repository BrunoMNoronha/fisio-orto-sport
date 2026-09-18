// Integração com PostgreSQL real: NOT NULL de painTypes e lock do paciente na criação da anamnese.
// Roda só com INTEGRATION_DATABASE_URL apontando para um banco DESCARTÁVEL já migrado
// (os dados criados aqui não são limpos). Roda com node:test via `pnpm test:integration`,
// fora do Jest, porque o runtime ESM do Prisma 7 não carrega no Jest (CommonJS).
// Ver src/modules/clinico/README.md.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { ClinicoRuleError, PATIENT_INACTIVE, assertPatientCanReceiveAnamnesis } from "@/modules/clinico/rules";

const url = process.env.INTEGRATION_DATABASE_URL;
describe("anamnese no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let prisma: PrismaClient;
  let other: Client;
  // Conexão só para observar pg_stat_activity: `other` pode estar parada esperando lock.
  let monitor: Client;
  let authorId: string;

  before(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    other = new Client({ connectionString: url });
    await other.connect();
    monitor = new Client({ connectionString: url });
    await monitor.connect();
    const user = await prisma.user.create({
      data: { name: "Fisio Teste", email: `fisio-${Date.now()}@teste.local`, passwordHash: "x", role: "FISIOTERAPEUTA" },
    });
    authorId = user.id;
  });

  after(async () => {
    await other?.end();
    await monitor?.end();
    await prisma?.$disconnect();
  });

  const newPatient = () =>
    prisma.patient.create({
      data: { fullName: "Paciente Teste", birthDate: new Date("1990-01-01"), phone: "11999999999", createdById: authorId, updatedById: authorId },
      select: { id: true },
    });

  const createVersion = (patientId: string) =>
    prisma.$transaction(async (tx) => {
      await assertPatientCanReceiveAnamnesis(tx, patientId);
      return tx.anamnesis.create({
        data: { patientId, authorId, authorNameSnapshot: "Fisio Teste", assessmentDate: new Date("2026-09-01"), chiefComplaint: "Dor" },
        select: { id: true, painTypes: true },
      });
    });

  // Espera até existir uma sessão bloqueada aguardando lock (evita sleeps fixos).
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

  it("painTypes omitido grava lista vazia; NULL explícito é rejeitado pelo banco", async () => {
    const { id } = await newPatient();
    const created = await createVersion(id);
    assert.deepEqual(created.painTypes, []);

    await assert.rejects(
      other.query(
        `INSERT INTO "Anamnesis" (id, "patientId", "authorId", "authorNameSnapshot", "assessmentDate", "chiefComplaint", "painTypes")
         VALUES ('nulo-' || md5(random()::text), $1, $2, 'x', '2026-09-01', 'Dor', NULL)`,
        [id, authorId],
      ),
      { code: "23502" },
    );
  });

  it("inativação em curso bloqueia a criação, que então relê INATIVO e é rejeitada", async () => {
    const { id } = await newPatient();
    await other.query("BEGIN");
    await other.query(`UPDATE "Patient" SET status = 'INATIVO' WHERE id = $1`, [id]);

    const pending = createVersion(id).then(
      () => "criou",
      (error: unknown) => error,
    );
    await waitForLockWait();
    await other.query("COMMIT");

    const outcome = await pending;
    assert.ok(outcome instanceof ClinicoRuleError);
    assert.equal(outcome.message, PATIENT_INACTIVE);
    assert.equal(await prisma.anamnesis.count({ where: { patientId: id } }), 0);
  });

  it("criação em curso faz a inativação esperar; a versão é gravada com o paciente ainda ativo", async () => {
    const { id } = await newPatient();
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => (locked = r));

    const creating = prisma.$transaction(async (tx) => {
      await assertPatientCanReceiveAnamnesis(tx, id);
      locked();
      await hold;
      await tx.anamnesis.create({
        data: { patientId: id, authorId, authorNameSnapshot: "Fisio Teste", assessmentDate: new Date("2026-09-01"), chiefComplaint: "Dor" },
      });
    });
    await lockTaken;

    const inactivating = other.query(`UPDATE "Patient" SET status = 'INATIVO' WHERE id = $1`, [id]);
    await waitForLockWait();
    release();
    await creating;
    await inactivating;

    assert.equal(await prisma.anamnesis.count({ where: { patientId: id } }), 1);
    assert.equal((await prisma.patient.findUnique({ where: { id }, select: { status: true } }))?.status, "INATIVO");
    await assert.rejects(createVersion(id), { message: PATIENT_INACTIVE });
  });
});
