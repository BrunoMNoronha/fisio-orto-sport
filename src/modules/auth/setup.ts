import "server-only";
import { prisma } from "@/lib/db";

// Primeiro acesso: enquanto não existir nenhum usuário, a tela de login vira cadastro do
// primeiro Administrador (ver `setupFirstAdmin` em actions.ts). Consulta barata: só checa
// a existência de uma linha.
export async function hasAnyUser(): Promise<boolean> {
  return (await prisma.user.findFirst({ select: { id: true } })) !== null;
}
