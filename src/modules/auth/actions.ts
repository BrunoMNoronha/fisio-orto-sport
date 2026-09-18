"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getDummyHash, verifyPassword } from "./password";
import { loginAttemptsByIp, loginFailuresByEmail } from "./rate-limit";
import { safeRedirectPath } from "./redirect-path";
import { createSession, deleteSession } from "./session";
import { loginSchema } from "./validation";

export type LoginState = { error?: string; email?: string } | undefined;

// Pré-computa o hash fictício ao carregar o módulo (evita diferença de tempo na 1ª tentativa).
void getDummyHash();

const GENERIC_LOGIN_ERROR = "E-mail ou senha inválidos.";
// Mesma mensagem para qualquer e-mail, exista ou não (não revela contas).
const TOO_MANY_ATTEMPTS = "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.";

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = formData.get("email");
  const typedEmail = typeof rawEmail === "string" ? rawEmail.slice(0, 254) : "";

  const ipKey = `ip:${await clientIp()}`;
  if (loginAttemptsByIp.isBlocked(ipKey)) return { error: TOO_MANY_ATTEMPTS, email: typedEmail };
  loginAttemptsByIp.hit(ipKey);

  const parsed = loginSchema.safeParse({ email: rawEmail, password: formData.get("password") });
  if (!parsed.success) return { error: GENERIC_LOGIN_ERROR, email: typedEmail };

  const emailKey = `email:${parsed.data.email}`;
  if (loginFailuresByEmail.isBlocked(emailKey)) return { error: TOO_MANY_ATTEMPTS, email: typedEmail };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true, active: true },
  });

  // Sempre executa o scrypt, mesmo sem usuário, para não revelar por tempo se o e-mail existe.
  const passwordOk = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !user.active || !passwordOk) {
    loginFailuresByEmail.hit(emailKey);
    return { error: GENERIC_LOGIN_ERROR, email: typedEmail };
  }

  await deleteSession(); // descarta uma sessão anterior neste navegador, se houver
  let created = false;
  try {
    created = await createSession(user.id, user.passwordHash);
  } catch (error) {
    // Conflito de serialização com uma alteração simultânea do usuário: trata como falha.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
  }
  if (!created) return { error: GENERIC_LOGIN_ERROR, email: typedEmail };

  loginFailuresByEmail.reset(emailKey);
  redirect(safeRedirectPath(formData.get("next")));
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
