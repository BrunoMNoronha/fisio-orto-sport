"use server";

// Gravação das configurações pelo Administrador (issue #63). A permissão é checada aqui, no
// servidor, independentemente de o menu esconder o painel.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requestIp } from "@/modules/auditoria/record";
import { AuthorizationError, assertPermission } from "@/modules/auth/dal";
import { fieldErrors, type FieldErrors } from "@/modules/auth/validation";
import { SETTINGS_FIELDS } from "./settings";
import { settingsSchema } from "./validation";
import { SettingsConflictError, saveClinicSettings } from "./write";

export type SettingsActionState =
  | { ok?: boolean; message?: string; error?: string; conflict?: boolean; version?: number; fieldErrors?: FieldErrors }
  | undefined;

const FORM_KEYS = [...SETTINGS_FIELDS, "expectedVersion"];

export async function saveSettings(_prev: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  let actor;
  try {
    actor = await assertPermission("configuracoes:gerir");
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: "Acesso negado." };
    throw error;
  }

  const raw = Object.fromEntries(FORM_KEYS.map((key) => [key, formData.get(key) ?? undefined]));
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Corrija os campos destacados. Nada foi salvo.", fieldErrors: fieldErrors(parsed.error) };
  }

  const { expectedVersion, ...values } = parsed.data;
  let result;
  try {
    result = await saveClinicSettings(prisma, {
      values,
      expectedVersion,
      actor: { id: actor.id, role: actor.role, ip: await requestIp() },
    });
  } catch (error) {
    if (error instanceof SettingsConflictError) return { error: error.message, conflict: true };
    // Qualquer outra falha: nada foi gravado (transação), e a mensagem não finge sucesso.
    console.error(`[configuracoes] falha ao salvar. ${error instanceof Error ? error.name : typeof error}`);
    return { error: "Não foi possível salvar as configurações. Nada foi alterado; tente novamente." };
  }

  if (result.fields.length === 0) return { ok: true, message: "Nenhuma alteração para salvar.", version: result.version };
  // Navegação, agenda e impressões leem a configuração a cada requisição; revalidar o layout
  // descarta o que o roteador do cliente guardou.
  revalidatePath("/", "layout");
  return { ok: true, message: "Configurações salvas.", version: result.version };
}
