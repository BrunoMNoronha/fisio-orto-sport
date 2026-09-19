import "server-only";
import { prisma } from "@/lib/db";

// Bootstrap do sistema: enquanto NÃO existir nenhum usuário, o primeiro cadastro vira
// Administrador. Assim que existir qualquer usuário — ativo ou não — a regra deixa de
// valer e a rota de cadastro responde 404. Não há como reabri-la pela aplicação.
export async function isBootstrapOpen(): Promise<boolean> {
  const existing = await prisma.user.findFirst({ select: { id: true } });
  return existing === null;
}
