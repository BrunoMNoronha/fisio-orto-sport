"use server";

// Anamnese. A action checa `clinico:gerir` no servidor, independentemente da UI.
// Versionamento append-only: só cria registros; nunca atualiza nem exclui versões.
// Mensagens de erro são genéricas e nunca ecoam o conteúdo enviado.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AuthorizationError, assertPermission } from "@/modules/auth/dal";
import { fieldErrors, type FieldErrors } from "@/modules/auth/validation";
import { insertAnamnesisVersion } from "./anamnesis-service";
import { ClinicoRuleError, PATIENT_NOT_FOUND } from "./rules";
import { anamnesisFormEntries, anamnesisSchema, isPlausibleId } from "./validation";

export type AnamnesisActionState = { error?: string; fieldErrors?: FieldErrors } | undefined;

async function guard(): Promise<{ id: string; name: string } | AnamnesisActionState> {
  try {
    const actor = await assertPermission("clinico:gerir");
    return { id: actor.id, name: actor.name };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: "Acesso negado." };
    throw error;
  }
}

function isActor(value: unknown): value is { id: string; name: string } {
  return typeof value === "object" && value !== null && "id" in value && "name" in value;
}

// Uso: createAnamnesisVersion.bind(null, patientId). O patientId vem do cliente e é revalidado aqui.
export async function createAnamnesisVersion(
  patientId: string,
  _prev: AnamnesisActionState,
  formData: FormData,
): Promise<AnamnesisActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;
  if (!isPlausibleId(patientId)) return { error: PATIENT_NOT_FOUND };

  const parsed = anamnesisSchema.safeParse(anamnesisFormEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    await insertAnamnesisVersion(prisma, patientId, parsed.data, actor.id);
  } catch (error) {
    if (error instanceof ClinicoRuleError) return { error: error.message };
    throw error;
  }

  const path = `/pacientes/${patientId}/anamnese`;
  revalidatePath(path);
  revalidatePath(`/pacientes/${patientId}`);
  redirect(path);
}
