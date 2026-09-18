// Camada de acesso a dados (DAL) de autenticação: a checagem real de sessão e permissão.
// Use em toda página, Server Action e Route Handler protegidos. O proxy é só otimista.
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";
import { can, type Permission } from "./permissions";
import { SESSION_COOKIE, hashToken } from "./session";

export type CurrentUser = { id: string; name: string; email: string; role: Role };

export const LOGIN_PATH = "/login";
export const ACCESS_DENIED_PATH = "/acesso-negado";

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      user: { select: { id: true, name: true, email: true, role: true, active: true } },
    },
  });
  if (!session) return null;

  // Sessão expirada ou usuário desativado: invalida no banco (o cookie órfão não autentica mais).
  if (session.expiresAt.getTime() <= Date.now() || !session.user.active) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  const { id, name, email, role } = session.user;
  return { id, name, email, role };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}

export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect(ACCESS_DENIED_PATH);
  return user;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(ACCESS_DENIED_PATH);
  return user;
}

export class AuthorizationError extends Error {
  constructor(message = "Acesso negado.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

// Para Server Actions: não redireciona; lança erro que a action converte em resposta.
export async function assertPermission(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !can(user.role, permission)) throw new AuthorizationError();
  return user;
}
