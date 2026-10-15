// Integração da exclusão de usuário desativado (issue #76) com PostgreSQL real: catálogo de vínculos
// contra as FKs do banco, exclusão permitida, bloqueio por vínculo, auditoria preservada, rollback e
// concorrência. Usa o mesmo `deleteDeactivatedUser` da action. Banco DESCARTÁVEL já migrado.
// Não mexe em ClinicSettings (linha única, usada em paralelo pela suíte de configurações).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  ACTIVE_USER,
  SELF_DELETE,
  USER_LINKS,
  USER_NOT_FOUND,
  UserDeleteError,
  deleteDeactivatedUser,
  linkedMessage,
} from "@/modules/auth/users/delete";

const url = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !url) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

describe("exclusão de usuário desativado no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let prisma: PrismaClient;
  let other: Client;
  let otherPid: number;
  let monitor: Client;
  let adminId: string;
  const suffix = Date.now();
  let seq = 0;
  const actor = () => ({ actorId: adminId, actorRole: "ADMIN" as const, ip: null });

  const newUser = (active = false, role: "RECEPCAO" | "FISIOTERAPEUTA" | "ADMIN" = "RECEPCAO") =>
    prisma.user.create({
      data: { name: `Excluir ${++seq}`, email: `excluir-${suffix}-${seq}@teste.local`, passwordHash: "x", role, active },
      select: { id: true },
    });

  async function outcome(promise: Promise<void>) {
    try {
      await promise;
      return { ok: true as const };
    } catch (error) {
      if (error instanceof UserDeleteError) return { error: error.message };
      throw error;
    }
  }

  const exists = async (id: string) => (await prisma.user.count({ where: { id } })) === 1;

  async function waitForLockWait() {
    for (let i = 0; i < 100; i++) {
      const { rows } = await monitor.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND (pid = $1 OR $1 = ANY(pg_blocking_pids(pid)))`,
        [otherPid],
      );
      if (rows[0].n > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Nenhuma sessão ficou aguardando lock.");
  }

  before(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    other = new Client({ connectionString: url });
    await other.connect();
    otherPid = (await other.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    monitor = new Client({ connectionString: url });
    await monitor.connect();
    adminId = (await newUser(true, "ADMIN")).id;
  });

  after(async () => {
    await other?.end();
    await monitor?.end();
    await prisma?.$disconnect();
  });

  it("o catálogo de vínculos cobre todas as FKs para User (exceto Session)", async () => {
    const { rows } = await monitor.query(
      `SELECT src.relname AS table, att.attname AS column
         FROM pg_constraint c
         JOIN pg_class src ON src.oid = c.conrelid
         JOIN pg_class dst ON dst.oid = c.confrelid
         JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = ANY (c.conkey)
        WHERE c.contype = 'f' AND dst.relname = 'User' AND src.relname <> 'Session'
          AND src.relnamespace = to_regnamespace(current_schema())`,
    );
    const fromDb = rows.map((row) => `${row.table}.${row.column}`).sort();
    const catalog = USER_LINKS.map((link) => `${link.table}.${link.column}`).sort();
    assert.deepEqual(catalog, fromDb);
  });

  it("exclui conta desativada sem vínculos: sessões removidas, auditoria anterior mantida e evento novo", async () => {
    const target = await newUser();
    await prisma.session.create({ data: { tokenHash: `tok-${suffix}-${seq}`, userId: target.id, expiresAt: new Date("2099-01-01") } });
    await prisma.auditLog.create({ data: { action: "LOGIN", result: "SUCESSO", actorId: target.id, actorRole: "RECEPCAO" } });
    await prisma.auditLog.create({ data: { action: "USUARIO_DESATIVADO", result: "SUCESSO", actorId: adminId, targetUserId: target.id } });

    await deleteDeactivatedUser(prisma, actor(), target.id);

    assert.equal(await exists(target.id), false);
    assert.equal(await prisma.session.count({ where: { userId: target.id } }), 0);
    const events = await prisma.auditLog.findMany({
      where: { OR: [{ actorId: target.id }, { targetUserId: target.id }] },
      orderBy: { createdAt: "asc" },
      select: { action: true, actorId: true },
    });
    assert.deepEqual(events.map((event) => event.action), ["LOGIN", "USUARIO_DESATIVADO", "USUARIO_EXCLUIDO"]);
    assert.equal(events.at(-1)?.actorId, adminId);
  });

  it("recusa conta ativa, autoexclusão e conta inexistente, sem efeitos", async () => {
    const active = await newUser(true);
    assert.deepEqual(await outcome(deleteDeactivatedUser(prisma, actor(), active.id)), { error: ACTIVE_USER });
    assert.equal(await exists(active.id), true);

    const selfAdmin = await newUser(false, "ADMIN");
    assert.deepEqual(
      await outcome(deleteDeactivatedUser(prisma, { ...actor(), actorId: selfAdmin.id }, selfAdmin.id)),
      { error: SELF_DELETE },
    );
    assert.equal(await exists(selfAdmin.id), true);

    assert.deepEqual(await outcome(deleteDeactivatedUser(prisma, actor(), "nao-existe")), { error: USER_NOT_FOUND });
  });

  it("cada categoria de vínculo bloqueia a exclusão e preserva o vínculo", async () => {
    const financialLink = async (userId: string, reversal: boolean) => {
      const patient = await prisma.patient.create({
        data: { fullName: "Paciente Financeiro", birthDate: new Date("1990-01-01"), phone: "11999999999", createdById: adminId, updatedById: adminId },
      });
      const charge = await prisma.charge.create({
        data: { patientId: patient.id, description: "Recebimento fictício", amountCents: 1000, dueDate: new Date("2026-10-10"), createdById: adminId, idempotencyKey: `author-charge-${suffix}-${++seq}` },
      });
      const payment = await prisma.payment.create({
        data: { chargeId: charge.id, amountCents: 100, receivedOn: new Date("2026-09-01"), createdById: reversal ? adminId : userId, idempotencyKey: `RECEBIMENTO:author-pay-${suffix}-${++seq}`, fingerprint: `v1:${"0".repeat(64)}` },
      });
      if (reversal) await prisma.paymentReversal.create({
        data: { paymentId: payment.id, reason: "Estorno fictício", reversedOn: new Date("2026-09-02"), createdById: userId, idempotencyKey: `ESTORNO:author-rev-${suffix}-${++seq}`, fingerprint: `v1:${"1".repeat(64)}` },
      });
    };
    const cases: [string, (userId: string) => Promise<unknown>][] = [
      ["financeiro", (userId) => financialLink(userId, false)],
      ["financeiro", (userId) => financialLink(userId, true)],
      [
        "pacientes",
        (userId) =>
          prisma.patient.create({
            data: { fullName: "Paciente Vínculo", birthDate: new Date("1990-01-01"), phone: "11999999999", createdById: userId, updatedById: adminId },
          }),
      ],
      [
        "agenda",
        async (userId) => {
          const patient = await prisma.patient.create({
            data: { fullName: "Paciente Agenda", birthDate: new Date("1990-01-01"), phone: "11999999999", createdById: adminId, updatedById: adminId },
          });
          const day = new Date(Date.UTC(2096, 0, 1 + seq));
          await prisma.appointment.create({
            data: {
              patientId: patient.id,
              professionalId: (await newUser(true, "FISIOTERAPEUTA")).id,
              startsAt: day,
              endsAt: new Date(day.getTime() + 3_600_000),
              createdById: userId,
              updatedById: adminId,
            },
          });
        },
      ],
      [
        "bloqueios",
        async (userId) => {
          const day = new Date(Date.UTC(2096, 5, 1 + seq));
          await prisma.scheduleBlock.create({
            data: {
              professionalId: (await newUser(true, "FISIOTERAPEUTA")).id,
              startsAt: day,
              endsAt: new Date(day.getTime() + 3_600_000),
              createdById: userId,
            },
          });
        },
      ],
      [
        "prontuario",
        async (userId) => {
          const patient = await prisma.patient.create({
            data: { fullName: "Paciente Prontuário", birthDate: new Date("1990-01-01"), phone: "11999999999", createdById: adminId, updatedById: adminId },
          });
          await prisma.anamnesis.create({
            data: { patientId: patient.id, authorId: userId, authorNameSnapshot: "Autor", assessmentDate: new Date("2026-09-01"), chiefComplaint: "Dor" },
          });
        },
      ],
    ];
    for (const [category, link] of cases) {
      const target = await newUser(false, "FISIOTERAPEUTA");
      await link(target.id);
      const result = await outcome(deleteDeactivatedUser(prisma, actor(), target.id));
      assert.deepEqual(result, { error: linkedMessage([category as never]) }, category);
      assert.equal(await exists(target.id), true, category);
      assert.equal(
        await prisma.auditLog.count({ where: { action: "USUARIO_EXCLUIDO", targetUserId: target.id } }),
        0,
        category,
      );
    }
  });

  it("falha ao gravar a auditoria desfaz a exclusão e a remoção das sessões", async () => {
    const target = await newUser();
    await prisma.session.create({ data: { tokenHash: `tok-${suffix}-${seq}`, userId: target.id, expiresAt: new Date("2099-01-01") } });
    const failingAudit = {
      $transaction: ((fn: (tx: unknown) => Promise<unknown>) =>
        prisma.$transaction((tx) =>
          fn(
            new Proxy(tx, {
              get: (targetTx, prop) =>
                prop === "auditLog"
                  ? { create: async () => Promise.reject(new Error("auditoria indisponível")) }
                  : Reflect.get(targetTx, prop),
            }),
          ),
        )) as PrismaClient["$transaction"],
    };
    await assert.rejects(deleteDeactivatedUser(failingAudit, actor(), target.id), /auditoria indisponível/);
    assert.equal(await exists(target.id), true);
    assert.equal(await prisma.session.count({ where: { userId: target.id } }), 1);
  });

  it("duas exclusões simultâneas: uma exclui, a outra é informada; um único evento", async () => {
    const target = await newUser();
    const second = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    try {
      const results = await Promise.all([
        outcome(deleteDeactivatedUser(prisma, actor(), target.id)),
        outcome(deleteDeactivatedUser(second, actor(), target.id)),
      ]);
      assert.equal(results.filter((result) => "ok" in result).length, 1);
      assert.ok(results.some((result) => "error" in result && result.error === USER_NOT_FOUND));
      assert.equal(await prisma.auditLog.count({ where: { action: "USUARIO_EXCLUIDO", targetUserId: target.id } }), 1);
    } finally {
      await second.$disconnect();
    }
  });

  it("reativação em curso faz a exclusão esperar e então recusar", async () => {
    const target = await newUser();
    await other.query("BEGIN");
    await other.query(`UPDATE "User" SET "active" = true WHERE "id" = $1`, [target.id]);
    const pending = outcome(deleteDeactivatedUser(prisma, actor(), target.id));
    await waitForLockWait();
    await other.query("COMMIT");
    assert.deepEqual(await pending, { error: ACTIVE_USER });
    assert.equal(await exists(target.id), true);
  });

  it("vínculo novo em curso faz a exclusão esperar e então recusar", async () => {
    const target = await newUser(false, "FISIOTERAPEUTA");
    await other.query("BEGIN");
    await other.query(
      `INSERT INTO "Patient" ("id", "fullName", "birthDate", "phone", "createdById", "updatedById", "updatedAt")
       VALUES ($1, 'Paciente Corrida', '1990-01-01', '11999999999', $2, $3, now())`,
      [`corrida-${suffix}`, target.id, adminId],
    );
    const pending = outcome(deleteDeactivatedUser(prisma, actor(), target.id));
    await waitForLockWait();
    await other.query("COMMIT");
    assert.deepEqual(await pending, { error: linkedMessage(["pacientes"]) });
    assert.equal(await exists(target.id), true);
  });

  it("exclusão em curso faz a reativação esperar; depois a conta não existe", async () => {
    const target = await newUser();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slowDb = {
      $transaction: ((fn: (tx: unknown) => Promise<unknown>) =>
        prisma.$transaction(async (tx) => {
          const result = await fn(tx);
          await gate; // segura o COMMIT com a linha já travada e excluída
          return result;
        })) as PrismaClient["$transaction"],
    };
    const deleting = deleteDeactivatedUser(slowDb, actor(), target.id);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const reactivate = other.query(`UPDATE "User" SET "active" = true WHERE "id" = $1`, [target.id]);
    await waitForLockWait();
    release();
    await deleting;
    const result = await reactivate;
    assert.equal(result.rowCount, 0);
    assert.equal(await exists(target.id), false);
  });
});
