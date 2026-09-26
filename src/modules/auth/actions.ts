"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { SetupClosedError, createFirstAdmin, isSetupEnabled, isValidSetupToken } from "./bootstrap";
import { getDummyHash, hashPassword, verifyPassword } from "./password";
import { loginAttemptsByIp, loginFailuresByEmail, setupAttemptsByIp } from "./rate-limit";
import { safeRedirectPath } from "./redirect-path";
import { createSession, deleteSession } from "./session";
import { hasAnyUser } from "./setup";
import { fieldErrors, firstAdminSchema, loginSchema, type FieldErrors } from "./validation";

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

// --- Primeiro acesso ---------------------------------------------------------------
// Enquanto a tabela de usuários está vazia, a tela de login mostra o cadastro do primeiro
// Administrador. Não há quem autentique, então a autorização é o código SETUP_TOKEN definido
// no servidor (ver bootstrap.ts); sem ele, o primeiro acesso pela web fica desligado. A tabela
// vazia é reconferida numa transação serializável, para que duas chamadas simultâneas não
// criem dois administradores.
export type SetupState =
  | { error?: string; fieldErrors?: FieldErrors; values?: { name?: string; email?: string } }
  | undefined;

const SETUP_DISABLED = "O primeiro acesso não está habilitado neste servidor. Procure o responsável técnico.";
const SETUP_INVALID_TOKEN = "Código de configuração inválido.";
const SETUP_CLOSED = "O primeiro usuário já foi cadastrado. Atualize a página para entrar.";
const SETUP_RETRY = "Não foi possível concluir o cadastro. Tente novamente.";
const SETUP_TOO_MANY_ATTEMPTS = "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

export async function setupFirstAdmin(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const rawName = formData.get("name");
  const rawEmail = formData.get("email");
  const values = {
    name: typeof rawName === "string" ? rawName.slice(0, 120) : undefined,
    email: typeof rawEmail === "string" ? rawEmail.slice(0, 254) : undefined,
  };

  // A action continua acessível por POST depois do primeiro cadastro. Limite por IP, código de
  // configuração e checagem barata antes do scrypt evitam que ela vire um gerador de custo anônimo.
  const ipKey = `ip:${await clientIp()}`;
  if (setupAttemptsByIp.isBlocked(ipKey)) return { error: SETUP_TOO_MANY_ATTEMPTS, values };
  setupAttemptsByIp.hit(ipKey);
  if (!isSetupEnabled()) return { error: SETUP_DISABLED, values };
  if (!isValidSetupToken(formData.get("setupToken"))) return { error: SETUP_INVALID_TOKEN, values };
  if (await hasAnyUser()) return { error: SETUP_CLOSED, values };

  const parsed = firstAdminSchema.safeParse({
    name: rawName ?? undefined,
    email: rawEmail ?? undefined,
    password: formData.get("password") ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const { password, ...data } = parsed.data;
  const passwordHash = await hashPassword(password);

  let userId: string;
  try {
    userId = await createFirstAdmin(prisma, { ...data, passwordHash });
  } catch (error) {
    if (error instanceof SetupClosedError) return { error: SETUP_CLOSED, values };
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002: outra requisição criou o mesmo e-mail antes. P2034: conflito de serialização.
      if (error.code === "P2002") return { error: SETUP_CLOSED, values };
      if (error.code === "P2034") return { error: SETUP_RETRY, values };
    }
    throw error;
  }

  await deleteSession(); // descarta uma sessão anterior neste navegador, se houver
  if (!(await createSession(userId, passwordHash))) return { error: SETUP_RETRY, values };

  redirect(safeRedirectPath(formData.get("next")));
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
