// Integração da limpeza pela aba Desenvolvimento (#78) com PostgreSQL real: mesmo serviço da CLI
// (executeReset) com banco conferido, auditoria do evento, preservação de usuários/configurações/
// auditoria, sessões encerradas, rollback e concorrência com a geração de dados fictícios. Esvazia
// tabelas: por isso cria um banco PRÓPRIO e o descarta no fim.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { MARKER_PREFIX, expectedCounts } from "@/modules/dados-ficticios/catalog";
import { generateDevData } from "@/modules/dados-ficticios/generate";
import { CLEARED_TABLES, ResetAbort, executeReset } from "@/modules/manutencao/reset";

const baseUrl = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !baseUrl) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

describe("limpeza pela web no PostgreSQL", { skip: !baseUrl && "INTEGRATION_DATABASE_URL não definida" }, () => {
  const dbName = `limpeza_it_${Date.now()}`;
  let admin: Client;
  let raw: Client;
  let prisma: PrismaClient;
  const ids = {} as Record<"admin" | "fisio", string>;
  const actor = () => ({ id: ids.admin, role: "ADMIN" as const, ip: "127.0.0.1" });
  const rows = async (table: string) => (await raw.query(`SELECT * FROM "${table}" ORDER BY 1`)).rows;
  const count = async (table: string) => (await raw.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n as number;
  const generate = () => generateDevData(prisma, { actorId: ids.admin, ip: null, expectedDatabase: dbName });
  const reset = () => executeReset(prisma, { expectedDatabase: dbName, actor: actor() });

  before(async () => {
    admin = new Client({ connectionString: baseUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${dbName}"`);
    const target = new URL(baseUrl!);
    target.pathname = `/${dbName}`;
    execSync("pnpm exec prisma migrate deploy", { env: { ...process.env, DATABASE_URL: target.toString() }, stdio: "pipe" });
    raw = new Client({ connectionString: target.toString() });
    await raw.connect();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.toString() }) });
    ids.admin = (await prisma.user.create({ data: { name: "ADMIN", email: "admin@limpeza.test", passwordHash: "h1", role: "ADMIN" } })).id;
    ids.fisio = (
      await prisma.user.create({
        data: { name: "FISIO", email: "fisio@limpeza.test", passwordHash: "h2", role: "FISIOTERAPEUTA", crefito: "9-F" },
      })
    ).id;
    await prisma.clinicSettings.create({ data: { id: 1, displayName: "CLÍNICA", updatedById: ids.admin } });
    await prisma.auditLog.create({ data: { action: "LOGIN", result: "SUCESSO", actorId: ids.admin, actorRole: "ADMIN" } });
  });

  after(async () => {
    await prisma?.$disconnect();
    await raw?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin.end();
    }
  });

  it("banco diferente do permitido aborta sem alterar nada", async () => {
    await generate();
    const patients = await count("Patient");
    await assert.rejects(executeReset(prisma, { expectedDatabase: "fisio_orto_sport", actor: actor() }), ResetAbort);
    assert.equal(await count("Patient"), patients);
  });

  it("falha intermediária desfaz tudo, inclusive o evento de auditoria", async () => {
    const before = { patients: await count("Patient"), audit: await count("AuditLog") };
    await assert.rejects(
      executeReset(prisma, {
        expectedDatabase: dbName,
        actor: actor(),
        hooks: {
          afterClear: async () => {
            throw new Error("falha simulada");
          },
        },
      }),
      /falha simulada/,
    );
    assert.equal(await count("Patient"), before.patients);
    assert.equal(await count("AuditLog"), before.audit);
  });

  it("limpa só as tabelas previstas; preserva usuários, configurações e auditoria; registra o evento", async () => {
    await prisma.session.create({ data: { tokenHash: `t-${Date.now()}`, userId: ids.admin, expiresAt: new Date(Date.now() + 3_600_000) } });
    const users = await rows("User");
    const settings = await rows("ClinicSettings");
    const audit = await rows("AuditLog");

    const result = await reset();
    assert.ok(result.before.Patient > 0);
    for (const table of CLEARED_TABLES) assert.equal(await count(table), 0, table);
    assert.deepEqual(await rows("User"), users);
    assert.deepEqual(await rows("ClinicSettings"), settings);
    const auditAfter = await rows("AuditLog");
    assert.deepEqual(auditAfter.slice(0, audit.length), audit);
    assert.equal(auditAfter.length, audit.length + 1);
    const event = auditAfter.at(-1)!;
    assert.equal(event.action, "BASE_REINICIADA");
    assert.equal(event.actorId, ids.admin);
    assert.match(event.details, /usuários, configurações e auditoria preservados/);
    // A sessão de quem executou também foi encerrada: a ação web manda para o login.
    assert.equal(await count("Session"), 0);
  });

  it("limpeza e geração concorrentes: sempre conjunto completo ou base vazia, nunca parcial", async () => {
    for (let round = 0; round < 3; round++) {
      await generate();
      const outcomes = await Promise.allSettled([reset(), generate(), reset(), generate()]);
      for (const outcome of outcomes) assert.equal(outcome.status, "fulfilled", String((outcome as PromiseRejectedResult).reason));
      const patients = await prisma.patient.count({ where: { notes: { startsWith: MARKER_PREFIX } } });
      const appointments = await count("Appointment");
      const expected = expectedCounts();
      assert.ok(
        (patients === 0 && appointments === 0) || (patients === expected.patients && appointments === expected.appointments),
        `estado parcial: ${patients} pacientes, ${appointments} agendamentos`,
      );
      assert.equal(await count("User"), 2);
    }
  });
});
