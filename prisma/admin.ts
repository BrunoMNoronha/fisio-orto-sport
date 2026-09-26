// Cria o Administrador ou redefine a senha dele, no banco de DATABASE_URL.
// - E-mail inexistente: cria um usuário ADMIN ativo.
// - E-mail de um ADMIN existente: troca a senha, reativa se estiver inativo e encerra as sessões.
// - E-mail de outro perfil: recusa (não promove ninguém a ADMIN).
// A senha é pedida no terminal, sem eco, para não ficar no histórico do shell nem em arquivo.
//
// Uso: pnpm db:admin --email <email> [--name "<nome>"]
//      (--name só é usado na criação; padrão "Administrador")
// Para outro banco (ex.: Neon): $env:DATABASE_URL="<url direta>"; pnpm db:admin --email ...
import "dotenv/config";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/modules/auth/password";
import { PASSWORD_MAX, PASSWORD_MIN } from "../src/modules/auth/validation";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function ask(question: string, { hidden = false } = {}) {
  return new Promise<string>((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Escreve só a pergunta; o que for digitado não aparece na tela.
      const writer = rl as unknown as { _writeToOutput: (s: string) => void };
      writer._writeToOutput = (s) => {
        if (s.startsWith(question)) process.stdout.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

let values: Record<string, unknown>;
try {
  ({ values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } }));
} catch (error) {
  fail(`${error instanceof Error ? error.message : error}\nUso: pnpm db:admin --email <email> [--name "<nome>"]`);
}

const args = z
  .object({
    email: z.string({ error: "Informe --email." }).trim().toLowerCase().pipe(z.email("E-mail inválido.")),
    name: z.string().trim().min(2, "--name deve ter pelo menos 2 caracteres.").max(120).default("Administrador"),
  })
  .safeParse(values);
if (!args.success) fail(args.error.issues.map((issue) => `- ${issue.message}`).join("\n"));
const { email, name } = args.data;

const databaseUrl = process.env.DATABASE_URL ?? fail("DATABASE_URL não definida.");
const url = new URL(databaseUrl);
const target = `${url.hostname}${url.pathname}`;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
  console.log(`Banco: ${target}${isLocal ? " (local)" : " (REMOTO)"}`);

  const existing = await prisma.user
    .findUnique({ where: { email }, select: { id: true, role: true, active: true } })
    .catch((error: unknown) => {
      if (error instanceof Error && /does not exist/.test(error.message)) {
        fail("A tabela User não existe neste banco. Rode as migrações antes: pnpm exec prisma migrate deploy");
      }
      throw error;
    });

  if (existing && existing.role !== "ADMIN") {
    fail(`${email} existe com o perfil ${existing.role}. Este script só cria ou altera Administradores.`);
  }

  const action = existing
    ? `Redefinir a senha do Administrador ${email}${existing.active ? "" : " (será reativado)"}`
    : `Criar o Administrador ${email} (${name})`;
  const confirm = await ask(`${action} em ${target}? Digite "sim" para continuar: `);
  if (confirm.trim().toLowerCase() !== "sim") fail("Cancelado.");

  const password = await ask("Nova senha: ", { hidden: true });
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    fail(`A senha deve ter entre ${PASSWORD_MIN} e ${PASSWORD_MAX} caracteres.`);
  }
  if ((await ask("Repita a senha: ", { hidden: true })) !== password) fail("As senhas não conferem.");
  const passwordHash = await hashPassword(password);

  if (existing) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: existing.id }, data: { passwordHash, active: true } }),
      // Senha trocada: derruba as sessões abertas com a senha antiga.
      prisma.session.deleteMany({ where: { userId: existing.id } }),
    ]);
    console.log(`Senha do Administrador ${email} redefinida. Sessões anteriores encerradas.`);
  } else {
    await prisma.user.create({ data: { name, email, role: "ADMIN", passwordHash } });
    console.log(`Administrador ${email} criado.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
