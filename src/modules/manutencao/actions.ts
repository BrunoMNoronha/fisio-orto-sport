"use server";

// Limpeza da base pela aba Desenvolvimento das Configurações (#78). Mesmo núcleo do `pnpm db:reset`
// (reset.ts), sem nunca executar comandos de shell e sem a exceção da auditoria (que só existe na CLI).
// Tudo é checado aqui, no servidor, antes de qualquer escrita: habilitação técnica e alvo permitido
// (DEV_RESET_TARGET), sessão de Administrador e confirmação digitada (nome do banco e LIMPAR). Abrir a
// aba ou salvar configurações nunca dispara a limpeza; ela também nunca chama a geração de dados.
//
// A limpeza encerra TODAS as sessões (inclusive a atual): depois do sucesso, o cookie é removido e a
// pessoa vai para o login.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requestIp } from "@/modules/auditoria/record";
import { SESSION_COOKIE } from "@/modules/auth/cookie-name";
import { AuthorizationError, assertPermission } from "@/modules/auth/dal";
import { UNAVAILABLE, currentDevResetAvailability } from "@/modules/dados-ficticios/guard";
import { RESET_WORD, ResetAbort, executeReset } from "./reset";

export type ResetActionState = { error?: string } | undefined;

export async function resetDevDatabase(_prev: ResetActionState, formData: FormData): Promise<ResetActionState> {
  const availability = currentDevResetAvailability();
  if (!availability.enabled) return { error: UNAVAILABLE };

  let actor;
  try {
    actor = await assertPermission("configuracoes:gerir");
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: "Acesso negado." };
    throw error;
  }
  if (actor.role !== "ADMIN") return { error: "Apenas um Administrador pode limpar a base." };

  const typedDatabase = String(formData.get("database") ?? "").trim();
  const typedWord = String(formData.get("word") ?? "").trim();
  if (typedDatabase !== availability.target.database || typedWord !== RESET_WORD) {
    return { error: `Confirmação incorreta: digite o nome do banco e a palavra ${RESET_WORD}. Nada foi alterado.` };
  }

  try {
    await executeReset(prisma, {
      expectedDatabase: availability.target.database,
      actor: { id: actor.id, role: actor.role, ip: await requestIp() },
    });
  } catch (error) {
    if (error instanceof ResetAbort) return { error: `${error.message} A transação foi desfeita; nada foi alterado.` };
    // Só o tipo do erro vai para o log (sem dados nem URL).
    console.error(`[manutencao] falha na limpeza pela web. ${error instanceof Error ? error.name : typeof error}`);
    return { error: "Não foi possível limpar a base. A transação foi desfeita; nada foi alterado." };
  }

  // A sessão atual também foi apagada no banco: remove o cookie e manda para o login.
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login?base=limpa");
}
