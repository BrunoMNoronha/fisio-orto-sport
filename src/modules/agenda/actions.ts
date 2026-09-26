"use server";

// Agendamentos. Cada action checa `agenda:gerir` no servidor, independentemente de a UI
// esconder os botões. Não há exclusão física: o agendamento é cancelado.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AuthorizationError, assertPermission } from "@/modules/auth/dal";
import { fieldErrors, type FieldErrors } from "@/modules/auth/validation";
import { cancelAppointmentRecord, insertAppointment, moveAppointment, ruleFailure } from "./service";
import { appointmentSchema, cancelSchema, rescheduleSchema } from "./validation";
import { normalizeSearch } from "@/modules/pacientes/validation";

export type AppointmentActionState =
  | { ok?: boolean; message?: string; error?: string; fieldErrors?: FieldErrors }
  | undefined;

const AGENDA_PATH = "/agenda";
const SLOT_FIELDS = ["professionalId", "date", "startTime", "endTime"];

async function guard(): Promise<{ actorId: string } | AppointmentActionState> {
  try {
    const actor = await assertPermission("agenda:gerir");
    return { actorId: actor.id };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: "Acesso negado." };
    throw error;
  }
}

function isActor(value: unknown): value is { actorId: string } {
  return typeof value === "object" && value !== null && "actorId" in value;
}

function entries(formData: FormData, keys: string[]) {
  return Object.fromEntries(
    keys.map((key) => {
      const value = formData.get(key);
      return [key, typeof value === "string" ? value : undefined];
    }),
  );
}

export async function createAppointment(
  _prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = appointmentSchema.safeParse(entries(formData, ["patientId", ...SLOT_FIELDS, "notes"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const data = parsed.data;
  let id: string;
  try {
    id = await insertAppointment(prisma, data, actor.actorId);
  } catch (error) {
    const failure = ruleFailure(error);
    if (failure) return failure;
    throw error;
  }
  revalidatePath(AGENDA_PATH);
  redirect(`${AGENDA_PATH}/${id}`);
}

export async function rescheduleAppointment(
  _prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = rescheduleSchema.safeParse(entries(formData, ["id", ...SLOT_FIELDS]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { id, ...slot } = parsed.data;
  try {
    const outcome = await moveAppointment(prisma, id, slot, actor.actorId);
    if (outcome) return outcome;
  } catch (error) {
    const failure = ruleFailure(error);
    if (failure) return failure;
    throw error;
  }
  revalidatePath(AGENDA_PATH);
  revalidatePath(`${AGENDA_PATH}/${id}`);
  redirect(`${AGENDA_PATH}/${id}`);
}

export async function cancelAppointment(
  _prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = cancelSchema.safeParse(entries(formData, ["id", "reason"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { id, reason } = parsed.data;
  const failure = await cancelAppointmentRecord(prisma, id, reason, actor.actorId);
  if (failure) return failure;

  revalidatePath(AGENDA_PATH);
  revalidatePath(`${AGENDA_PATH}/${id}`);
  return { ok: true, message: "Agendamento cancelado." };
}

// --- Busca de pacientes para agendar (issue #38) --------------------------------------
// Substitui a lista fixa de 500: busca no servidor por nome (sem acentos nem maiúsculas),
// só pacientes ativos, só id e nome, em ordem estável e com no máximo PATIENT_SEARCH_LIMIT
// resultados por consulta. A escolha continua validada em createAppointment.
export type PatientOption = { id: string; label: string };
export type PatientSearchResult = { items: PatientOption[]; hasMore: boolean } | { error: string };

const PATIENT_SEARCH_LIMIT = 20;
const PATIENT_SEARCH_MAX = 100;

export async function searchActivePatients(query: unknown): Promise<PatientSearchResult> {
  const actor = await guard();
  if (!isActor(actor)) return { error: actor?.error ?? "Acesso negado." };
  const term = typeof query === "string" ? normalizeSearch(query.trim().slice(0, PATIENT_SEARCH_MAX)) : "";
  const rows = await prisma.patient.findMany({
    where: { status: "ATIVO", ...(term ? { searchName: { contains: term } } : {}) },
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
    take: PATIENT_SEARCH_LIMIT + 1,
    select: { id: true, fullName: true },
  });
  return {
    items: rows.slice(0, PATIENT_SEARCH_LIMIT).map((patient) => ({ id: patient.id, label: patient.fullName })),
    hasMore: rows.length > PATIENT_SEARCH_LIMIT,
  };
}
