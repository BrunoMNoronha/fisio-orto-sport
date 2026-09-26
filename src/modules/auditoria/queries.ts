import "server-only";
import { prisma } from "@/lib/db";
import type { AuditAction, Prisma } from "@/generated/prisma/client";
import { addDays, toInstant } from "@/modules/agenda/validation";
import { requirePermission } from "@/modules/auth/dal";
import { purgeExpiredAuditSafely } from "./record";
import { AUDIT_PAGE_SIZE, type AuditFilters } from "./validation";

// Consulta da trilha de auditoria (A4): só quem tem `auditoria:ler` (Administrador).
export async function listAuditLogs(filters: AuditFilters) {
  await requirePermission("auditoria:ler");
  // Expurgo oportunista (A5): a consulta nunca mostra registro vencido que ainda não foi removido.
  await purgeExpiredAuditSafely();

  const createdAt: Prisma.DateTimeFilter = {};
  if (filters.from) createdAt.gte = toInstant(filters.from, "00:00");
  if (filters.to) createdAt.lt = toInstant(addDays(filters.to, 1), "00:00");

  const where: Prisma.AuditLogWhereInput = {
    ...(filters.userId ? { OR: [{ actorId: filters.userId }, { targetUserId: filters.userId }] } : {}),
    ...(filters.action ? { action: filters.action as AuditAction } : {}),
    ...(filters.from || filters.to ? { createdAt } : {}),
  };

  const [total, items] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
  ]);
  return { items, total, page: filters.page, pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}

// Nomes para exibir quem agiu e o alvo. Usuários nunca são excluídos; id desconhecido vira "—".
export async function listAuditUserOptions() {
  await requirePermission("auditoria:ler");
  return prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } });
}
