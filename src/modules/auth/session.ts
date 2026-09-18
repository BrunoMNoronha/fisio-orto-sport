import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { SESSION_COOKIE } from "./cookie-name";

export { SESSION_COOKIE };
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Define cookie: só pode ser chamada em Server Action ou Route Handler.
// Cria a sessão só se o usuário continuar ativo e com o mesmo hash de senha verificado
// (numa transação serializável), para que uma redefinição de senha ou desativação
// concorrente não deixe uma sessão nova para trás. Devolve false se o estado mudou.
export async function createSession(userId: string, verifiedPasswordHash: string): Promise<boolean> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const created = await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, active: true, passwordHash: verifiedPasswordHash },
        select: { id: true },
      });
      if (!user) return false;
      // Aproveita para limpar sessões expiradas do próprio usuário.
      await tx.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
      await tx.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
      return true;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  if (!created) return false;

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return true;
}

// Remove cookie: só pode ser chamada em Server Action ou Route Handler.
export async function deleteSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  cookieStore.delete(SESSION_COOKIE);
}
