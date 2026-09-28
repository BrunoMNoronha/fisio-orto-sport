"use server";

// Ação "Popular com dados fictícios" (issue #73). Tudo é checado aqui, no servidor, antes de qualquer
// escrita e independentemente de a interface esconder a seção: habilitação técnica do ambiente e alvo
// permitido, sessão válida e perfil Administrador. Fora de desenvolvimento, a resposta não revela nada
// além de "indisponível".
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requestIp } from "@/modules/auditoria/record";
import { AuthorizationError, assertPermission } from "@/modules/auth/dal";
import type { EntityCounts } from "./catalog";
import { DevDataError, NOT_ADMIN, generateDevData } from "./generate";
import { UNAVAILABLE, currentDevDataAvailability } from "./guard";

export type DevDataActionState =
  | { ok: true; created: boolean; counts: EntityCounts; reference: string }
  | { ok: false; error: string }
  | undefined;

export async function populateDevData(): Promise<DevDataActionState> {
  const availability = currentDevDataAvailability();
  if (!availability.enabled) return { ok: false, error: UNAVAILABLE };

  let actor;
  try {
    actor = await assertPermission("configuracoes:gerir");
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "Acesso negado." };
    throw error;
  }
  if (actor.role !== "ADMIN") return { ok: false, error: NOT_ADMIN };

  let result;
  try {
    result = await generateDevData(prisma, {
      actorId: actor.id,
      ip: await requestIp(),
      expectedDatabase: availability.target.database,
    });
  } catch (error) {
    if (error instanceof DevDataError) return { ok: false, error: error.message };
    // Transação desfeita: nada foi gravado. Só o tipo do erro vai para o log (sem dados).
    console.error(`[dados-ficticios] falha na geração. ${error instanceof Error ? error.name : typeof error}`);
    return { ok: false, error: "Não foi possível gerar os dados fictícios. Nada foi gravado; tente novamente." };
  }

  if (result.created) revalidatePath("/", "layout");
  return { ok: true, ...result };
}
