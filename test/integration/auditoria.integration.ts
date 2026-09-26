// Integração com PostgreSQL real da trilha de auditoria (issue #56): imutabilidade pelo trigger
// (A7), expurgo dos registros com mais de 7 dias (A5) e reversão da alteração quando o registro
// falha na mesma transação (A8). Os registros recentes criados aqui não podem ser apagados, por
// definição; por isso o banco precisa ser DESCARTÁVEL e já migrado (INTEGRATION_DATABASE_URL).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { AUDIT_RETENTION_DAYS } from "@/modules/auditoria/events";
import { purgeExpiredAudit, writeAudit } from "@/modules/auditoria/write";

const url = process.env.INTEGRATION_DATABASE_URL;
describe("auditoria no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  const suffix = Date.now();
  let prisma: PrismaClient;
  const DAY = 24 * 60 * 60 * 1000;

  // Só o teste data um registro; a aplicação nunca informa createdAt (write.ts).
  async function insertAt(tag: string, createdAt: Date) {
    const row = await prisma.auditLog.create({
      data: { action: "LOGIN", result: "FALHA", targetUserId: `${tag}-${suffix}`, createdAt },
      select: { id: true },
    });
    return row.id;
  }

  const rejectsByTrigger = (promise: Promise<unknown>) =>
    assert.rejects(promise, (error: unknown) => {
      assert.match(String((error as Error).message), /AuditLog/);
      return true;
    });

  before(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  it("recusa UPDATE, DELETE recente e TRUNCATE (A7)", async () => {
    const id = await insertAt("recente", new Date());
    await rejectsByTrigger(prisma.auditLog.update({ where: { id }, data: { result: "SUCESSO" } }));
    await rejectsByTrigger(prisma.$executeRaw`UPDATE "AuditLog" SET "ip" = '1.1.1.1' WHERE "id" = ${id}`);
    await rejectsByTrigger(prisma.auditLog.delete({ where: { id } }));
    await rejectsByTrigger(prisma.$executeRawUnsafe(`TRUNCATE "AuditLog"`));
    const row = await prisma.auditLog.findUnique({ where: { id } });
    assert.equal(row?.result, "FALHA");
    assert.equal(row?.ip, null);
  });

  it(`expurga só os registros com mais de ${AUDIT_RETENTION_DAYS} dias (A5)`, async () => {
    const expired = await insertAt("vencido", new Date(Date.now() - (AUDIT_RETENTION_DAYS + 1) * DAY));
    const almost = await insertAt("quase", new Date(Date.now() - (AUDIT_RETENTION_DAYS - 1) * DAY));
    const recent = await insertAt("novo", new Date());

    // Registro vencido também não pode ser alterado; só removido.
    await rejectsByTrigger(prisma.auditLog.update({ where: { id: expired }, data: { ip: "1.1.1.1" } }));

    const removed = await purgeExpiredAudit(prisma);
    assert.ok(removed >= 1);
    assert.equal(await prisma.auditLog.findUnique({ where: { id: expired } }), null);
    assert.ok(await prisma.auditLog.findUnique({ where: { id: almost } }));
    assert.ok(await prisma.auditLog.findUnique({ where: { id: recent } }));
    assert.equal(await prisma.auditLog.count({ where: { createdAt: { lt: new Date(Date.now() - AUDIT_RETENTION_DAYS * DAY) } } }), 0);
  });

  it("falha ao gravar o registro desfaz a alteração na mesma transação (A8)", async () => {
    const email = `a8-${suffix}@teste.local`;
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { name: "A8", email, role: "RECEPCAO", passwordHash: "x" }, select: { id: true } });
        // IP acima de VarChar(45): o banco recusa o registro.
        await writeAudit(tx, { action: "USUARIO_CRIADO", result: "SUCESSO", targetUserId: user.id, ip: "9".repeat(46) });
      }),
    );
    assert.equal(await prisma.user.count({ where: { email } }), 0);

    const ok = `a8-ok-${suffix}@teste.local`;
    const id = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name: "A8 ok", email: ok, role: "RECEPCAO", passwordHash: "x" }, select: { id: true } });
      await writeAudit(tx, { action: "USUARIO_CRIADO", result: "SUCESSO", targetUserId: user.id, ip: "203.0.113.7" });
      return user.id;
    });
    const log = await prisma.auditLog.findFirst({ where: { targetUserId: id } });
    assert.equal(log?.action, "USUARIO_CRIADO");
    assert.equal(log?.ip, "203.0.113.7");
    assert.ok(Math.abs(log!.createdAt.getTime() - Date.now()) < 60_000, "createdAt vem do relógio do banco");
  });
});
