"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPermission, AuthorizationError } from "@/modules/auth/dal";
import { fieldErrors } from "@/modules/auth/validation";
import { coverageSchema, authorizationSchema, authorizationItemSchema, authorizationRuleSchema } from "./beneficiary-validation";
import { saveBeneficiary, saveAuthorizationRule } from "./beneficiary-service";
import { AdministrativeConfigError } from "./service";
import type { ConfigActionState } from "./actions";
export async function saveCoverage(_: ConfigActionState, form: FormData) { return save("coverage", form); }
export async function saveAuthorization(_: ConfigActionState, form: FormData) { return save("authorization", form); }
export async function saveAuthorizationItem(_: ConfigActionState, form: FormData) { return save("item", form); }
export async function saveProcedureRule(_: ConfigActionState, form: FormData) { return save("rule", form); }
async function save(kind: "coverage" | "authorization" | "item" | "rule", form: FormData): Promise<ConfigActionState> {
  let actor;
  try { actor = await assertPermission(kind === "rule" ? "administrativo:configurar" : "administrativo:preparar"); }
  catch (error) { if (error instanceof AuthorizationError) return { error: "Acesso negado." }; throw error; }
  const common = ["id","requestId","expectedVersion","reason","active"];
  const fields = kind === "coverage" ? ["patientId","contractId","beneficiaryName","cardNumber","planName","startsOn","endsOn"]
    : kind === "authorization" ? ["coverageId","contractId","number","accessCode","issuedOn","startsOn","endsOn"]
    : kind === "item" ? ["authorizationId","contractId","procedureId","authorizedQuantity"] : ["procedureId","mode","reference"];
  const raw = Object.fromEntries([...common,...fields].map((key) => [key,form.get(key) ?? ""]));
  let destination: string;
  try {
    if (kind === "coverage") {
      const result = coverageSchema.safeParse(raw);
      if (!result.success) return { error: "Corrija os campos destacados.", fieldErrors: fieldErrors(result.error) };
      const id = await saveBeneficiary(prisma, actor.id, { kind, values: result.data });
      revalidatePath(`/administrativo/beneficiarios/${result.data.patientId}`);
      destination = `/administrativo/coberturas/${id}`;
    } else if (kind === "authorization") {
      const result = authorizationSchema.safeParse(raw);
      if (!result.success) return { error: "Corrija os campos destacados.", fieldErrors: fieldErrors(result.error) };
      const id = await saveBeneficiary(prisma, actor.id, { kind, values: result.data });
      revalidatePath(`/administrativo/coberturas/${result.data.coverageId}`);
      destination = `/administrativo/autorizacoes/${id}`;
    } else if (kind === "item") {
      const result = authorizationItemSchema.safeParse(raw);
      if (!result.success) return { error: "Corrija os campos destacados.", fieldErrors: fieldErrors(result.error) };
      const id = await saveBeneficiary(prisma, actor.id, { kind, values: result.data });
      revalidatePath(`/administrativo/autorizacoes/${result.data.authorizationId}`);
      destination = `/administrativo/itens/${id}`;
    } else {
      const result = authorizationRuleSchema.safeParse(raw);
      if (!result.success) return { error: "Corrija os campos destacados.", fieldErrors: fieldErrors(result.error) };
      await saveAuthorizationRule(prisma, actor.id, result.data);
      destination = `/configuracoes/procedimentos/${result.data.procedureId}`;
    }
  } catch (error) {
    if (error instanceof AdministrativeConfigError) return { error: error.message };
    console.error("[administrativo] falha no beneficiário:", error instanceof Error ? error.name : typeof error);
    return { error: "Não foi possível salvar. Nenhuma alteração foi confirmada." };
  }
  revalidatePath("/administrativo"); revalidatePath(destination); redirect(destination);
}
