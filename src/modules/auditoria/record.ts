// Registro da auditoria nas ações do aplicativo (issue #56), com a política de falha de A8:
// - gestão de usuários grava com `writeAudit` (write.ts) na mesma transação da alteração: se o
//   registro falhar, a alteração é desfeita. O IP é lido antes, com `requestIp`;
// - login, logout e acesso negado gravam com `recordAudit`, que nunca bloqueia a ação: a falha
//   vai para o log do servidor só com a ação e o código do erro, sem dado pessoal.
import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { clientIpFrom } from "@/modules/auth/client-ip";
import type { AuditEntry } from "./events";
import { purgeExpiredAudit, writeAudit } from "./write";

// IP só atrás de proxy confiável (mesma regra dos limites de login); fora de requisição, null.
export async function requestIp(): Promise<string | null> {
  try {
    return clientIpFrom(await headers());
  } catch {
    return null;
  }
}

function logFailure(what: string, error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const name = error instanceof Error ? error.name : typeof error;
  console.error(`[auditoria] falha ao ${what}. ${name} ${code}`.trim());
}

export async function recordAudit(entry: Omit<AuditEntry, "ip">): Promise<void> {
  try {
    await writeAudit(prisma, { ...entry, ip: await requestIp() });
  } catch (error) {
    logFailure(`gravar ${entry.action}`, error);
  }
}

// Expurgo oportunista (A5), sem bloquear quem chamou.
export async function purgeExpiredAuditSafely(): Promise<void> {
  try {
    await purgeExpiredAudit(prisma);
  } catch (error) {
    logFailure("expurgar registros vencidos", error);
  }
}
