import "server-only";
// Simulação exibida na aba Desenvolvimento antes da confirmação da limpeza (#78): só leitura. Chamada
// apenas com a limpeza habilitada e para Administrador.
import { prisma } from "@/lib/db";
import { previewReset, type ResetPreview } from "./reset";

export async function getResetPreview(): Promise<ResetPreview> {
  return previewReset(prisma);
}
