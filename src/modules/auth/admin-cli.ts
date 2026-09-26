// Núcleo do `pnpm db:admin` (prisma/admin.ts), separado da entrada para ser testado sem terminal
// (issue #40). Cria o Administrador ou redefine a senha dele no banco de DATABASE_URL:
// - E-mail inexistente: cria um usuário ADMIN ativo.
// - E-mail de um ADMIN: troca a senha, reativa se estiver inativo e encerra as sessões.
// - E-mail de outro perfil: recusa (não promove ninguém a ADMIN).
// Toda validação e confirmação acontece antes de qualquer escrita. A senha só é lida pelo prompt
// oculto (nunca por argumento) e não aparece em nenhuma saída; a URL do banco nunca é impressa,
// só host e nome do banco.
import { parseArgs } from "node:util";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "./password";
import { PASSWORD_MAX, PASSWORD_MIN } from "./validation";

export const ADMIN_CLI_USAGE = 'Uso: pnpm db:admin --email <email> [--name "<nome>"]';

export class PromptClosedError extends Error {}

export type AdminCliIO = {
  // Rejeita com PromptClosedError se a entrada terminar (Ctrl+C ou fim do stdin).
  ask(question: string, options?: { hidden?: boolean }): Promise<string>;
  out(message: string): void;
  err(message: string): void;
};

export type AdminCliDb = Pick<PrismaClient, "user" | "$transaction" | "$disconnect">;

const argsSchema = z.object({
  email: z.string({ error: "Informe --email." }).trim().toLowerCase().pipe(z.email("E-mail inválido.")),
  name: z.string().trim().min(2, "--name deve ter pelo menos 2 caracteres.").max(120).default("Administrador"),
});

// Host e banco, sem usuário, senha nem parâmetros. null se a URL for inválida (sem ecoá-la).
export function describeTarget(databaseUrl: string) {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return null;
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!url.hostname || !database) return null;
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  return { label: `${url.hostname}/${database}`, database, local };
}

function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : undefined;
}

// Devolve o código de saída do processo (0 = sucesso).
export async function runAdminCli(
  argv: string[],
  databaseUrl: string | undefined,
  io: AdminCliIO,
  openDb: (url: string) => AdminCliDb,
): Promise<number> {
  let values: Record<string, unknown>;
  try {
    ({ values } = parseArgs({ args: argv, options: { email: { type: "string" }, name: { type: "string" } } }));
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : String(error)}\n${ADMIN_CLI_USAGE}`);
    return 1;
  }
  const args = argsSchema.safeParse(values);
  if (!args.success) {
    io.err(`${args.error.issues.map((issue) => `- ${issue.message}`).join("\n")}\n${ADMIN_CLI_USAGE}`);
    return 1;
  }
  const { email, name } = args.data;

  if (!databaseUrl) {
    io.err("DATABASE_URL não definida.");
    return 1;
  }
  const target = describeTarget(databaseUrl);
  if (!target) {
    io.err("DATABASE_URL inválida (o valor não é exibido).");
    return 1;
  }

  const db = openDb(databaseUrl);
  try {
    io.out(`Banco: ${target.label}${target.local ? " (local)" : " (REMOTO)"}`);

    let existing: { id: string; role: string; active: boolean } | null;
    try {
      existing = await db.user.findUnique({ where: { email }, select: { id: true, role: true, active: true } });
    } catch (error) {
      if (errorCode(error) === "P2021") {
        io.err("A tabela User não existe neste banco. Rode as migrações antes: pnpm exec prisma migrate deploy");
        return 1;
      }
      throw error;
    }
    if (existing && existing.role !== "ADMIN") {
      io.err(`${email} existe com o perfil ${existing.role}. Este script só cria ou altera Administradores.`);
      return 1;
    }

    const action = existing
      ? `Redefinir a senha do Administrador ${email}${existing.active ? "" : " (será reativado)"}; as sessões dele serão encerradas`
      : `Criar o Administrador ${email} (${name})`;
    // Banco remoto (ex.: produção): digitar o nome do banco, não só "sim".
    const expected = target.local ? "sim" : target.database;
    const confirm = await io.ask(
      `${action} em ${target.label}? Digite ${target.local ? '"sim"' : `o nome do banco ("${target.database}")`} para continuar: `,
    );
    if (confirm.trim() !== expected) {
      io.err("Cancelado. Nada foi alterado.");
      return 1;
    }

    const password = await io.ask("Nova senha: ", { hidden: true });
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      io.err(`A senha deve ter entre ${PASSWORD_MIN} e ${PASSWORD_MAX} caracteres. Nada foi alterado.`);
      return 1;
    }
    if ((await io.ask("Repita a senha: ", { hidden: true })) !== password) {
      io.err("As senhas não conferem. Nada foi alterado.");
      return 1;
    }
    const passwordHash = await hashPassword(password);

    if (existing) {
      const updated = await db.$transaction(async (tx) => {
        // Reconfere o perfil no momento da escrita (sem promover quem deixou de ser ADMIN).
        const { count } = await tx.user.updateMany({
          where: { id: existing.id, role: "ADMIN" },
          data: { passwordHash, active: true },
        });
        if (count === 0) return false;
        // Senha trocada: derruba as sessões abertas com a senha antiga.
        await tx.session.deleteMany({ where: { userId: existing.id } });
        return true;
      });
      if (!updated) {
        io.err(`${email} deixou de ser Administrador durante a operação. Nada foi alterado.`);
        return 1;
      }
      io.out(`Senha do Administrador ${email} redefinida. Sessões anteriores encerradas.`);
    } else {
      try {
        await db.user.create({ data: { name, email, role: "ADMIN", passwordHash } });
      } catch (error) {
        if (errorCode(error) === "P2002") {
          io.err(`${email} foi cadastrado por outra operação agora. Rode o comando de novo.`);
          return 1;
        }
        throw error;
      }
      io.out(`Administrador ${email} criado.`);
    }
    return 0;
  } catch (error) {
    if (error instanceof PromptClosedError) {
      io.err("\nCancelado. Nada foi alterado.");
      return 130;
    }
    // Só nome/código e a primeira linha: sem despejar o objeto (que pode carregar a configuração).
    const code = errorCode(error);
    const message = error instanceof Error ? error.message.split("\n").find((line) => line.trim()) : undefined;
    io.err(`Falha${code ? ` (${code})` : ""}: ${message ?? "erro inesperado"}`);
    return 1;
  } finally {
    await db.$disconnect();
  }
}
