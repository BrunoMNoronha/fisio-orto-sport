// Ponta a ponta do `pnpm db:admin` (issue #40): executa prisma/admin.ts num processo filho, com as
// respostas por stdin, contra o banco de integração. Confere criação, redefinição, reativação,
// encerramento de sessões, recusa de outro perfil e abortos antes de qualquer escrita, e que a
// senha não aparece na saída. Roda só com INTEGRATION_DATABASE_URL apontando para um banco
// DESCARTÁVEL já migrado (host local: a confirmação é "sim").
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { verifyPassword } from "@/modules/auth/password";

const url = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !url) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

const TSX = require.resolve("tsx/cli");

function run(args: string[], input: string[]) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [TSX, "prisma/admin.ts", ...args], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
    child.stdin.end(input.map((line) => `${line}\n`).join(""));
  });
}

describe("db:admin no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let prisma: PrismaClient;
  const suffix = Date.now();
  const email = (name: string) => `${name}-${suffix}@teste.local`;
  const PASSWORD = `senha-inicial-${suffix}`;
  const NEW_PASSWORD = `senha-nova-${suffix}`;

  before(() => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  const find = (address: string) =>
    prisma.user.findUnique({ where: { email: address }, select: { id: true, role: true, active: true, passwordHash: true } });

  it("cria o Administrador sem mostrar a senha nem a URL do banco", async () => {
    const address = email("novo");
    const { code, output } = await run(["--email", address.toUpperCase(), "--name", "Admin Novo"], ["sim", PASSWORD, PASSWORD]);
    assert.equal(code, 0, output);
    assert.match(output, /\(local\)/);
    assert.match(output, /criado\./);
    assert.ok(!output.includes(PASSWORD), "a senha apareceu na saída");
    assert.ok(!output.includes(url!), "a URL apareceu na saída");
    const user = await find(address);
    assert.equal(user?.role, "ADMIN");
    assert.equal(user?.active, true);
    assert.ok(await verifyPassword(PASSWORD, user!.passwordHash));
  });

  it("redefine a senha, reativa e encerra as sessões do Administrador", async () => {
    const address = email("reset");
    await run(["--email", address], ["sim", PASSWORD, PASSWORD]);
    const user = await find(address);
    await prisma.user.update({ where: { id: user!.id }, data: { active: false } });
    const expiresAt = new Date(Date.now() + 3_600_000);
    await prisma.session.createMany({
      data: [1, 2].map((n) => ({
        userId: user!.id,
        tokenHash: createHash("sha256").update(`sessao-${suffix}-${n}`).digest("hex"),
        expiresAt,
      })),
    });

    const { code, output } = await run(["--email", address], ["sim", NEW_PASSWORD, NEW_PASSWORD]);
    assert.equal(code, 0, output);
    assert.match(output, /será reativado/);
    assert.ok(!output.includes(NEW_PASSWORD));
    const updated = await find(address);
    assert.equal(updated?.active, true);
    assert.ok(await verifyPassword(NEW_PASSWORD, updated!.passwordHash));
    assert.equal(await verifyPassword(PASSWORD, updated!.passwordHash), false);
    assert.equal(await prisma.session.count({ where: { userId: user!.id } }), 0);
  });

  it("recusa e-mail de outro perfil sem perguntar nem alterar", async () => {
    const address = email("recepcao");
    await prisma.user.create({ data: { name: "Recepção", email: address, passwordHash: "x", role: "RECEPCAO" } });
    const { code, output } = await run(["--email", address], ["sim", PASSWORD, PASSWORD]);
    assert.equal(code, 1);
    assert.match(output, /perfil RECEPCAO/);
    assert.doesNotMatch(output, /Digite/);
    const user = await find(address);
    assert.equal(user?.role, "RECEPCAO");
    assert.equal(user?.passwordHash, "x");
  });

  it("cancelamento, senhas diferentes e fim da entrada não gravam nada", async () => {
    for (const [name, input, expected] of [
      ["cancelado", ["não"], 1],
      ["divergente", ["sim", PASSWORD, `${PASSWORD}x`], 1],
      ["fim-da-entrada", ["sim"], 130],
    ] as const) {
      const address = email(name);
      const { code, output } = await run(["--email", address], [...input]);
      assert.equal(code, expected, `${name}: ${output}`);
      assert.match(output, /Nada foi alterado/);
      assert.equal(await find(address), null, `${name} criou usuário`);
    }
  });

  it("argumento inválido e DATABASE_URL inválida param antes do banco, sem ecoar a URL", async () => {
    const bad = await run(["--email", "sem-arroba"], []);
    assert.equal(bad.code, 1);
    assert.match(bad.output, /E-mail inválido/);

    const child = await new Promise<{ code: number | null; output: string }>((resolve) => {
      const secret = "nao-e-url com-segredo-123";
      const proc = spawn(process.execPath, [TSX, "prisma/admin.ts", "--email", email("x")], {
        env: { ...process.env, DATABASE_URL: secret },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let output = "";
      proc.stdout.on("data", (chunk) => (output += chunk));
      proc.stderr.on("data", (chunk) => (output += chunk));
      proc.on("close", (code) => resolve({ code, output }));
      proc.stdin.end();
    });
    assert.equal(child.code, 1);
    assert.match(child.output, /DATABASE_URL inválida/);
    assert.ok(!child.output.includes("segredo-123"));
  });
});
