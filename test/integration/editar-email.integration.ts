// Integração da edição de e-mail pelo Administrador (issue #78) com PostgreSQL real: unicidade,
// atomicidade (nada parcial), sessões encerradas, própria conta e concorrência. Usa o mesmo
// `changeUser` da action. Banco DESCARTÁVEL já migrado.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { changeUser } from "@/modules/auth/users/change";
import { updateUserSchema } from "@/modules/auth/validation";

const url = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !url) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

describe("edição de e-mail no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let prisma: PrismaClient;
  let adminId: string;
  const suffix = Date.now();
  let seq = 0;
  const actor = () => ({ actorId: adminId, actorRole: "ADMIN" as const, ip: null });
  const mail = (tag: string) => `${tag}-${suffix}@teste.local`;

  const newUser = async (role: "RECEPCAO" | "FISIOTERAPEUTA" | "ADMIN" = "RECEPCAO") => {
    const n = ++seq;
    return prisma.user.create({
      data: { name: `EMAIL ${n}`, email: mail(`u${n}`), passwordHash: `hash-${n}`, role, crefito: role === "FISIOTERAPEUTA" ? `E${suffix}${n}`.slice(0, 20) : null },
    });
  };
  const session = (userId: string, tag: string) =>
    prisma.session.create({ data: { tokenHash: `${tag}-${suffix}-${++seq}`, userId, expiresAt: new Date(Date.now() + 3_600_000) } });

  // Mesmo caminho da action: schema do formulário e depois o núcleo transacional.
  const edit = (id: string, form: { name: string; email: string; role: string; crefito?: string }, keep: string | null = null) => {
    const { id: parsedId, ...data } = updateUserSchema.parse({ id, ...form });
    return changeUser(prisma, actor(), parsedId, data, keep);
  };

  before(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    adminId = (await newUser("ADMIN")).id;
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  it("troca o e-mail normalizado, preserva id/senha/vínculos e encerra as sessões do usuário", async () => {
    const user = await newUser();
    await session(user.id, "a");
    await session(user.id, "b");
    const other = await newUser();
    await session(other.id, "c");

    await edit(user.id, { name: user.name, email: `  NOVO-${suffix}@Teste.Local `, role: "RECEPCAO" });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(after.email, `novo-${suffix}@teste.local`);
    assert.equal(after.passwordHash, user.passwordHash);
    assert.equal(after.role, user.role);
    // O login procura pelo e-mail: o novo encontra a mesma conta, o anterior não encontra nada.
    assert.equal((await prisma.user.findUnique({ where: { email: `novo-${suffix}@teste.local` } }))?.id, user.id);
    assert.equal(await prisma.user.findUnique({ where: { email: user.email } }), null);
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
    assert.equal(await prisma.session.count({ where: { userId: other.id } }), 1);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { targetUserId: user.id }, orderBy: { createdAt: "desc" } });
    assert.equal(audit.action, "USUARIO_EDITADO");
    assert.equal(audit.details, "Campos: e-mail.");
    assert.doesNotMatch(JSON.stringify(audit), /novo-|teste\.local/);
  });

  it("e-mail repetido não altera nada (nem nome, perfil ou CREFITO) e não audita", async () => {
    const owner = await newUser();
    const user = await newUser();
    await session(user.id, "d");
    const auditsBefore = await prisma.auditLog.count({ where: { targetUserId: user.id } });

    await assert.rejects(
      edit(user.id, { name: "NOME TROCADO", email: owner.email.toUpperCase(), role: "FISIOTERAPEUTA", crefito: `X${suffix}`.slice(0, 20) }),
      (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
    );
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(after.name, user.name);
    assert.equal(after.email, user.email);
    assert.equal(after.role, "RECEPCAO");
    assert.equal(after.crefito, null);
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { targetUserId: user.id } }), auditsBefore);
  });

  it("na própria conta, o Administrador mantém a sessão atual e perde as demais", async () => {
    const current = await session(adminId, "atual");
    await session(adminId, "outra");
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    await edit(adminId, { name: admin.name, email: mail("admin-novo"), role: "ADMIN" }, current.tokenHash);
    const left = await prisma.session.findMany({ where: { userId: adminId } });
    assert.deepEqual(left.map((s) => s.tokenHash), [current.tokenHash]);
  });

  it("duas contas disputando o mesmo e-mail ao mesmo tempo: só uma fica com ele, sem alteração parcial", async () => {
    const a = await newUser();
    const b = await newUser();
    const target = mail("disputado");
    const results = await Promise.allSettled([
      edit(a.id, { name: "A RENOMEADA", email: target, role: "RECEPCAO" }),
      edit(b.id, { name: "B RENOMEADA", email: target, role: "RECEPCAO" }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    for (const r of results) {
      if (r.status === "rejected") {
        const code = (r.reason as { code?: string }).code;
        assert.ok(code === "P2002" || code === "P2034", `erro inesperado ${String(r.reason)}`);
      }
    }
    const rows = await prisma.user.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { id: "asc" } });
    const winner = rows.filter((row) => row.email === target);
    assert.equal(winner.length, 1);
    const loser = rows.find((row) => row.email !== target)!;
    // Quem perdeu mantém nome e e-mail originais.
    assert.equal(loser.name, loser.id === a.id ? a.name : b.name);
    assert.equal(loser.email, loser.id === a.id ? a.email : b.email);
  });
});
