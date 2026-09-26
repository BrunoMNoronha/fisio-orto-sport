import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

// Autorização do primeiro acesso (issue #35). O cadastro do primeiro Administrador pela tela
// de login só é aceito com o código definido em SETUP_TOKEN no servidor. Sem a variável (ou
// com um valor curto demais), o primeiro acesso pela web fica desligado: falha segura.
export const SETUP_TOKEN_MIN = 32;

function configuredToken(): string | null {
  const token = process.env.SETUP_TOKEN?.trim();
  return token && token.length >= SETUP_TOKEN_MIN ? token : null;
}

export function isSetupEnabled(): boolean {
  return configuredToken() !== null;
}

// Compara os SHA-256 (mesmo tamanho) em tempo constante; nunca registra nem devolve o valor.
export function isValidSetupToken(input: unknown): boolean {
  const expected = configuredToken();
  if (!expected || typeof input !== "string" || input.length > 512) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(input.trim()), digest(expected));
}

export class SetupClosedError extends Error {}

type FirstAdminData = { name: string; email: string; passwordHash: string };

// A tabela vazia é reconferida dentro de uma transação serializável, para que duas chamadas
// simultâneas não criem dois administradores. Lança SetupClosedError se já houver usuário;
// P2002 e P2034 (conflito de serialização) sobem para quem chamou.
export async function createFirstAdmin(db: PrismaClient, data: FirstAdminData): Promise<string> {
  return db.$transaction(
    async (tx) => {
      if ((await tx.user.count()) > 0) throw new SetupClosedError();
      const created = await tx.user.create({ data: { ...data, role: "ADMIN" }, select: { id: true } });
      return created.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
