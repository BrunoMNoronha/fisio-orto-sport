"use server";

// Marca o tour do financeiro como visto para o usuário da sessão. É preferência do próprio usuário:
// exige só autenticação, sem permissão de módulo nem auditoria. Pular e Concluir gravam igual.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/modules/auth/dal";

export type MarkTourSeenResult = { ok: true } | { error: string };

export async function markFinanceTourSeenAction(): Promise<MarkTourSeenResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Acesso negado." };
  // Idempotente: a primeira data não é sobrescrita por cliques repetidos ou outra aba.
  await prisma.user.updateMany({
    where: { id: user.id, financeTourSeenAt: null },
    data: { financeTourSeenAt: new Date() },
  });
  revalidatePath("/");
  return { ok: true };
}
