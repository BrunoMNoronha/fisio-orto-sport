"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPermission, AuthorizationError } from "@/modules/auth/dal";
import { fieldErrors } from "@/modules/auth/validation";
import { procedureSchema, tariffSchema, professionalSchema } from "./catalog-validation";
import { AdministrativeConfigError, saveAdministrativeConfig } from "./service";
import type { ConfigActionState } from "./actions";

export async function saveProcedure(_: ConfigActionState, form: FormData) { return save("procedure", form); }
export async function saveTariff(_: ConfigActionState, form: FormData) { return save("tariff", form); }
export async function saveProfessional(_: ConfigActionState, form: FormData) { return save("professional", form); }
async function save(kind: "procedure" | "tariff" | "professional", form: FormData): Promise<ConfigActionState> {
  let actor;
  try { actor = await assertPermission("administrativo:configurar"); }
  catch (error) { if (error instanceof AuthorizationError) return { error: "Acesso negado." }; throw error; }
  const common = ["id", "requestId", "expectedVersion", "reason", "active"];
  const fields = kind === "procedure" ? ["contractId","tableCode","code","name"] : kind === "tariff"
    ? ["procedureId","amount","startsOn","endsOn"] : ["userId","name","purpose","councilCode","councilNumber","councilState","occupationCode"];
  const raw = Object.fromEntries([...common,...fields].map((key) => [key, form.get(key) ?? ""]));
  let destination: string;
  try {
    if (kind === "procedure") {
      const parsed = procedureSchema.safeParse(raw);
      if (!parsed.success) return { error: "Corrija os campos destacados.", fieldErrors: fieldErrors(parsed.error) };
      const id = await saveAdministrativeConfig(prisma, actor.id, { kind, values: parsed.data });
      destination = `/configuracoes/procedimentos/${id}`;
    } else if (kind === "tariff") {
      const parsed = tariffSchema.safeParse(raw);
      if (!parsed.success) return { error: "Corrija os campos destacados.", fieldErrors: fieldErrors(parsed.error) };
      await saveAdministrativeConfig(prisma, actor.id, { kind, values: parsed.data });
      destination = `/configuracoes/procedimentos/${parsed.data.procedureId}`;
    } else {
      const parsed = professionalSchema.safeParse(raw);
      if (!parsed.success) return { error: "Corrija os campos destacados.", fieldErrors: fieldErrors(parsed.error) };
      const id = await saveAdministrativeConfig(prisma, actor.id, { kind, values: parsed.data });
      destination = `/configuracoes/profissionais/${id}`;
    }
  } catch (error) {
    if (error instanceof AdministrativeConfigError) return { error: error.message };
    console.error("[administrativo] falha no catálogo:", error instanceof Error ? error.name : typeof error);
    return { error: "Não foi possível salvar. Nenhuma alteração foi confirmada." };
  }
  revalidatePath("/configuracoes/procedimentos");
  revalidatePath("/configuracoes/profissionais");
  if (kind === "tariff") revalidatePath(`/configuracoes/tarifas/${raw.id}`);
  revalidatePath(destination);
  redirect(destination);
}
