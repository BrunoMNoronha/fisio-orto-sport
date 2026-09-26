// Gravação e expurgo da trilha de auditoria sobre um cliente Prisma qualquer (a aplicação, uma
// transação ou o `pnpm db:admin`). Sem `server-only` pelo mesmo motivo de events.ts.
import type { PrismaClient } from "@/generated/prisma/client";
import { AUDIT_RETENTION_DAYS, type AuditEntry } from "./events";

export type AuditWriter = Pick<PrismaClient, "auditLog">;

// createdAt fica sempre com o default do banco: a aplicação nunca data um registro.
export async function writeAudit(db: AuditWriter, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({ data: entry, select: { id: true } });
}

// Remove os registros vencidos (A5). O trigger do banco só aceita DELETE nessa condição.
export async function purgeExpiredAudit(db: Pick<PrismaClient, "$executeRaw">): Promise<number> {
  return db.$executeRaw`DELETE FROM "AuditLog" WHERE "createdAt" < now() - ${AUDIT_RETENTION_DAYS}::integer * interval '1 day'`;
}
