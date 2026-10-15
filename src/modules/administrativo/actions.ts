"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPermission, AuthorizationError } from "@/modules/auth/dal";
import { fieldErrors } from "@/modules/auth/validation";
import { operatorSchema, contractSchema } from "./validation";
import { AdministrativeConfigError, saveAdministrativeConfig } from "./service";

export type ConfigActionState = { error: string; fieldErrors?: Partial<Record<string, string[]>> } | undefined;
const common = ["id", "requestId", "expectedVersion", "reason", "name", "active"];

export async function saveOperator(_previous: ConfigActionState, form: FormData): Promise<ConfigActionState> {
  return save("operator", form);
}
export async function saveContract(_previous: ConfigActionState, form: FormData): Promise<ConfigActionState> {
  return save("contract", form);
}

async function save(kind: "operator" | "contract", form: FormData): Promise<ConfigActionState> {
  let actor;
  try { actor = await assertPermission("administrativo:configurar"); }
  catch (error) { if (error instanceof AuthorizationError) return { error: "Acesso negado." }; throw error; }
  const keys = kind === "operator" ? [...common, "registrationAns"]
    : [...common, "operatorId", "providerCode", "cnes", "tissVersion", "manualReference", "homologationChannel", "monthlySessions", "closingIntervalDays", "maxGuides", "maxItems", "maxXmlBytes", "maxExportRows"];
  const raw = Object.fromEntries(keys.map((key) => [key, form.get(key) ?? undefined]));
  let destination;
  let operatorPath;
  try {
    if (kind === "operator") {
      const parsed = operatorSchema.safeParse(raw);
      if (!parsed.success) return { error: "Corrija os campos destacados.", fieldErrors: fieldErrors(parsed.error) };
      const id = await saveAdministrativeConfig(prisma, actor.id, { kind, values: parsed.data });
      destination = `/configuracoes/operadoras/${id}`;
    } else {
      const parsed = contractSchema.safeParse(raw);
      if (!parsed.success) return { error: "Corrija os campos destacados.", fieldErrors: fieldErrors(parsed.error) };
      const id = await saveAdministrativeConfig(prisma, actor.id, { kind, values: parsed.data });
      operatorPath = `/configuracoes/operadoras/${parsed.data.operatorId}`;
      destination = `${operatorPath}/contratos/${id}`;
    }
  } catch (error) {
    if (error instanceof AdministrativeConfigError) return { error: error.message };
    console.error(`[administrativo] falha ao configurar: ${error instanceof Error ? error.name : typeof error}`);
    return { error: "Não foi possível salvar. Nenhuma alteração foi confirmada." };
  }
  revalidatePath("/configuracoes/operadoras");
  if (operatorPath) revalidatePath(operatorPath);
  revalidatePath(destination);
  redirect(destination);
}
