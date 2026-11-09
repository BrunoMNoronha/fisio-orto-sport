// Preferências de apresentação por usuário. Quem chama já autenticou (requireUser na página) e
// passa o id da sessão; nenhum id vem do cliente. Erro de leitura propaga, não vira "não viu".
import "server-only";
import { prisma } from "@/lib/db";

export async function hasSeenFinanceTour(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { financeTourSeenAt: true } });
  return row?.financeTourSeenAt != null;
}
