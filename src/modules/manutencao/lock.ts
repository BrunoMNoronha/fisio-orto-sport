// Lock consultivo das operações de manutenção (#73/#78): geração de dados fictícios e limpeza da base
// tomam o mesmo lock, na própria transação. Uma espera a outra terminar e só então confere o estado:
// nunca rodam ao mesmo tempo nem deixam resultado parcial ou enganoso.
import type { PrismaClient } from "@/generated/prisma/client";

const MAINTENANCE_LOCK_KEY = "manutencao:dados";

export async function lockMaintenance(tx: Pick<PrismaClient, "$executeRawUnsafe">) {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, MAINTENANCE_LOCK_KEY);
}
