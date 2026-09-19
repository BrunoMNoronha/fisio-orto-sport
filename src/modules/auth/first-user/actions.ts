"use server";

// Cadastro do primeiro usuário. Só funciona com a tabela `User` vazia; a partir daí a
// action recusa qualquer tentativa. A checagem que vale é a de dentro da transação
// serializável: a da página é só para não exibir o formulário à toa.
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { clientIp } from "../client-ip";
import { hashPassword } from "../password";
import { firstUserAttemptsByIp } from "../rate-limit";
import { createSession } from "../session";
import { fieldErrors, firstUserSchema, type FieldErrors } from "../validation";

export type FirstUserState =
  | { error?: string; fieldErrors?: FieldErrors; values?: { name: string; email: string } }
  | undefined;

const CLOSED = "O cadastro inicial já foi concluído. Entre com a sua conta.";
const TOO_MANY_ATTEMPTS = "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
const CONCURRENT = "Outro cadastro ocorreu ao mesmo tempo. Recarregue a página.";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function registerFirstUser(_prev: FirstUserState, formData: FormData): Promise<FirstUserState> {
  // Devolve nome e e-mail para o formulário não perder o que foi digitado (a senha nunca volta).
  const values = { name: text(formData, "name").slice(0, 120), email: text(formData, "email").slice(0, 254) };

  const ipKey = `ip:${await clientIp()}`;
  if (firstUserAttemptsByIp.isBlocked(ipKey)) return { error: TOO_MANY_ATTEMPTS, values };
  firstUserAttemptsByIp.hit(ipKey);

  const parsed = firstUserSchema.safeParse({
    name: formData.get("name") ?? undefined,
    email: formData.get("email") ?? undefined,
    password: formData.get("password") ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const { password, ...data } = parsed.data;
  const passwordHash = await hashPassword(password);

  let userId: string | null;
  try {
    // A contagem e a criação precisam ser atômicas, senão dois cadastros simultâneos
    // criariam dois Administradores. Mesmo isolamento usado em users/actions.ts.
    userId = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.user.findFirst({ select: { id: true } });
        if (existing) return null;
        const created = await tx.user.create({
          data: { ...data, role: "ADMIN", passwordHash },
          select: { id: true },
        });
        return created.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2034") return { error: CONCURRENT, values };
      // P2002 aqui só pode vir de outro cadastro que venceu a corrida.
      if (error.code === "P2002") return { error: CLOSED };
    }
    throw error;
  }
  if (userId === null) return { error: CLOSED };

  // Entra direto como o Administrador recém-criado.
  if (!(await createSession(userId, passwordHash))) redirect("/login");
  redirect("/");
}
