"use server";

// Cobranças manuais (FIN-01, #86). Cada action checa `financeiro:*` no servidor, inclusive quando
// chamada diretamente; sem sessão ou com usuário inativo, nega antes de consultar ou gravar. O autor
// é sempre o usuário da sessão. Não há edição nem exclusão física: corrigir é cancelar com motivo e
// lançar a substituta. As transações ficam em service.ts. Mensagens nunca ecoam o conteúdo enviado.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AuthorizationError, assertPermission } from "@/modules/auth/dal";
import { fieldErrors, type FieldErrors } from "@/modules/auth/validation";
import { normalizeSearch } from "@/modules/pacientes/validation";
import { ChargeRuleError, cancelCharge, createCharge, replaceCharge } from "./service";
import {
  CHARGE_FORM_FIELDS,
  cancelChargeSchema,
  createChargeSchema,
  formEntries,
  patientLabel,
  replaceChargeSchema,
} from "./validation";

export type ChargeActionState = { ok?: boolean; message?: string; error?: string; fieldErrors?: FieldErrors } | undefined;

const BASE_PATH = "/financeiro";

async function guard(): Promise<{ actorId: string } | { error: string }> {
  try {
    const actor = await assertPermission("financeiro:gerir");
    return { actorId: actor.id };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: "Acesso negado." };
    throw error;
  }
}

function failure(error: unknown): ChargeActionState {
  if (error instanceof ChargeRuleError) {
    return error.field ? { fieldErrors: { [error.field]: [error.message] } } : { error: error.message };
  }
  throw error;
}

function toData(parsed: { patientId: string; description: string; amount: number; dueDate: Date }) {
  return {
    patientId: parsed.patientId,
    description: parsed.description,
    amountCents: parsed.amount,
    dueDate: parsed.dueDate,
  };
}

export async function createChargeAction(_prev: ChargeActionState, formData: FormData): Promise<ChargeActionState> {
  const actor = await guard();
  if ("error" in actor) return actor;

  const parsed = createChargeSchema.safeParse(formEntries(formData, [...CHARGE_FORM_FIELDS, "requestId"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  let id: string;
  try {
    ({ id } = await createCharge(prisma, actor.actorId, { ...toData(parsed.data), requestId: parsed.data.requestId }));
  } catch (error) {
    return failure(error);
  }
  revalidatePath(BASE_PATH, "layout");
  redirect(`${BASE_PATH}/${id}`);
}

export async function cancelChargeAction(_prev: ChargeActionState, formData: FormData): Promise<ChargeActionState> {
  const actor = await guard();
  if ("error" in actor) return actor;

  const parsed = cancelChargeSchema.safeParse(formEntries(formData, ["id", "reason"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  let alreadyCancelled: boolean;
  try {
    ({ alreadyCancelled } = await cancelCharge(prisma, actor.actorId, { chargeId: parsed.data.id, reason: parsed.data.reason }));
  } catch (error) {
    return failure(error);
  }
  revalidatePath(BASE_PATH, "layout");
  return {
    ok: true,
    message: alreadyCancelled ? "Esta cobrança já estava cancelada; nada foi alterado." : "Cobrança cancelada.",
  };
}

export async function replaceChargeAction(_prev: ChargeActionState, formData: FormData): Promise<ChargeActionState> {
  const actor = await guard();
  if ("error" in actor) return actor;

  const parsed = replaceChargeSchema.safeParse(formEntries(formData, [...CHARGE_FORM_FIELDS, "id", "reason", "requestId"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  let id: string;
  try {
    ({ id } = await replaceCharge(prisma, actor.actorId, {
      ...toData(parsed.data),
      chargeId: parsed.data.id,
      reason: parsed.data.reason,
      requestId: parsed.data.requestId,
    }));
  } catch (error) {
    return failure(error);
  }
  revalidatePath(BASE_PATH, "layout");
  redirect(`${BASE_PATH}/${id}`);
}

// Busca de paciente do formulário de cobrança: qualquer paciente cadastrado (ativo ou inativo), só
// id e nome, em ordem estável e com no máximo PATIENT_SEARCH_LIMIT resultados por consulta.
export type ChargePatientOption = { id: string; label: string };
export type ChargePatientSearchResult = { items: ChargePatientOption[]; hasMore: boolean } | { error: string };

const PATIENT_SEARCH_LIMIT = 20;
const PATIENT_SEARCH_MAX = 100;

export async function searchChargePatients(query: unknown): Promise<ChargePatientSearchResult> {
  const actor = await guard();
  if ("error" in actor) return actor;
  const term = typeof query === "string" ? normalizeSearch(query.trim().slice(0, PATIENT_SEARCH_MAX)) : "";
  const rows = await prisma.patient.findMany({
    where: term ? { searchName: { contains: term } } : {},
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
    take: PATIENT_SEARCH_LIMIT + 1,
    select: { id: true, fullName: true, status: true },
  });
  return {
    items: rows.slice(0, PATIENT_SEARCH_LIMIT).map((patient) => ({ id: patient.id, label: patientLabel(patient) })),
    hasMore: rows.length > PATIENT_SEARCH_LIMIT,
  };
}
