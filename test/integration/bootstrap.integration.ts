// Integração com PostgreSQL real do primeiro acesso (issue #35): chamadas simultâneas de
// createFirstAdmin criam um único Administrador. Usa um schema temporário com uma cópia vazia da
// tabela User (o banco de integração já tem usuários de outros testes) e o remove no fim.
// Roda só com INTEGRATION_DATABASE_URL apontando para um banco DESCARTÁVEL já migrado.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { SetupClosedError, createFirstAdmin } from "@/modules/auth/bootstrap";

const url = process.env.INTEGRATION_DATABASE_URL;
describe("primeiro acesso no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  const schema = `bootstrap_${Date.now()}`;
  let admin: Client;
  let prisma: PrismaClient;

  before(async () => {
    admin = new Client({ connectionString: url });
    await admin.connect();
    const roles = await admin.query<{ label: string }>(
      `SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE t.typname = 'Role' AND n.nspname = 'public' ORDER BY e.enumsortorder`,
    );
    const labels = roles.rows.map((row) => `'${row.label}'`).join(", ");
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`CREATE TYPE "${schema}"."Role" AS ENUM (${labels})`);
    // INCLUDING ALL copia defaults, NOT NULL e os índices únicos (e-mail, CREFITO).
    await admin.query(`CREATE TABLE "${schema}"."User" (LIKE public."User" INCLUDING ALL)`);
    await admin.query(
      `ALTER TABLE "${schema}"."User" ALTER COLUMN role TYPE "${schema}"."Role" USING role::text::"${schema}"."Role"`,
    );
    // createFirstAdmin grava a auditoria na mesma transação (issue #56): cópia vazia de AuditLog,
    // com os enums no schema temporário, como em User.
    for (const type of ["AuditAction", "AuditResult"]) {
      const values = await admin.query<{ label: string }>(
        `SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE t.typname = $1 AND n.nspname = 'public' ORDER BY e.enumsortorder`,
        [type],
      );
      await admin.query(`CREATE TYPE "${schema}"."${type}" AS ENUM (${values.rows.map((row) => `'${row.label}'`).join(", ")})`);
    }
    await admin.query(`CREATE TABLE "${schema}"."AuditLog" (LIKE public."AuditLog" INCLUDING ALL)`);
    await admin.query(
      `ALTER TABLE "${schema}"."AuditLog"
         ALTER COLUMN action TYPE "${schema}"."AuditAction" USING action::text::"${schema}"."AuditAction",
         ALTER COLUMN result TYPE "${schema}"."AuditResult" USING result::text::"${schema}"."AuditResult",
         ALTER COLUMN "actorRole" TYPE "${schema}"."Role" USING "actorRole"::text::"${schema}"."Role"`,
    );
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }, { schema }) });
  });

  after(async () => {
    await prisma?.$disconnect();
    await admin?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.end();
  });

  beforeEach(async () => {
    await admin.query(`DELETE FROM "${schema}"."User"`);
    await admin.query(`DELETE FROM "${schema}"."AuditLog"`);
  });

  const data = (i: number) => ({ name: `Admin ${i}`, email: `admin-${i}@teste.local`, passwordHash: "x" });

  it("com banco vazio, cria o Administrador uma única vez", async () => {
    const id = await createFirstAdmin(prisma, data(0));
    const users = await prisma.user.findMany({ select: { id: true, role: true } });
    assert.deepEqual(users, [{ id, role: "ADMIN" }]);
    await assert.rejects(createFirstAdmin(prisma, data(1)), SetupClosedError);
    assert.equal(await prisma.user.count(), 1);
    const logs = await prisma.auditLog.findMany({ select: { action: true, actorId: true, targetUserId: true } });
    assert.deepEqual(logs, [{ action: "PRIMEIRO_ADMIN_CRIADO", actorId: id, targetUserId: id }]);
  });

  it("chamadas simultâneas criam um único Administrador", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => createFirstAdmin(prisma, data(i))));
    const ok = results.filter((result) => result.status === "fulfilled");
    assert.equal(ok.length, 1);
    for (const result of results) {
      if (result.status === "fulfilled") continue;
      const error = result.reason;
      // Perdedoras: tabela já ocupada ou conflito de serialização (P2034), nunca outro erro.
      const expected =
        error instanceof SetupClosedError ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034");
      assert.ok(expected, `erro inesperado: ${error}`);
    }
    assert.equal(await prisma.user.count(), 1);
    // Um único registro: as transações perdedoras foram desfeitas por inteiro.
    assert.equal(await prisma.auditLog.count(), 1);
  });

  it("mesmo e-mail em paralelo não cria dois registros", async () => {
    const results = await Promise.allSettled([createFirstAdmin(prisma, data(9)), createFirstAdmin(prisma, data(9))]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(await prisma.user.count(), 1);
  });
});
