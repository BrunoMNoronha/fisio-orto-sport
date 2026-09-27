"use server";

// Agendamentos. Cada action checa `agenda:gerir` no servidor, independentemente de a UI
// esconder os botões. Não há exclusão física: o agendamento é cancelado.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AuthorizationError, assertPermission } from "@/modules/auth/dal";
import { fieldErrors, type FieldErrors } from "@/modules/auth/validation";
import type { ConflictItem } from "./rules";
import {
  cancelAppointmentRecord,
  insertAppointment,
  insertScheduleBlock,
  moveAppointment,
  removeScheduleBlock,
  ruleFailure,
  setAttendanceRecord,
} from "./service";
import {
  appointmentSchema,
  attendanceSchema,
  blockSchema,
  cancelSchema,
  removeBlockSchema,
  rescheduleSchema,
} from "./validation";
import { normalizeSearch } from "@/modules/pacientes/validation";

export type AppointmentActionState =
  | {
      ok?: boolean;
      message?: string;
      error?: string;
      fieldErrors?: FieldErrors;
      // MEL-02: aviso de conflito do paciente (confirmar com `confirmPatientConflict=1`) e
      // agendamentos que impedem um bloqueio.
      patientConflicts?: ConflictItem[];
      conflicts?: ConflictItem[];
    }
  | undefined;

const AGENDA_PATH = "/agenda";
const BLOCKS_PATH = "/agenda/bloqueios";
const SLOT_FIELDS = ["professionalId", "date", "startTime", "endTime"];

// Conflito do paciente é só aviso (MEL-02): a pessoa confirma no formulário e reenvia.
function patientConflictOption(formData: FormData) {
  return { allowPatientConflict: formData.get("confirmPatientConflict") === "1" };
}

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
    id = await insertAppointment(prisma, data, actor.actorId, patientConflictOption(formData));
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
    const outcome = await moveAppointment(prisma, id, slot, actor.actorId, patientConflictOption(formData));
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
  try {
    const outcome = await cancelAppointmentRecord(prisma, id, reason, actor.actorId);
    if (outcome) return outcome;
  } catch (error) {
    const failure = ruleFailure(error);
    if (failure) return failure;
    throw error;
  }

  revalidatePath(AGENDA_PATH);
  revalidatePath(`${AGENDA_PATH}/${id}`);
  return { ok: true, message: "Agendamento cancelado." };
}

// Presença (MEL-01): Recepção, Fisioterapeuta e Administrador marcam, corrigem ou removem.
export async function setAttendance(
  _prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = attendanceSchema.safeParse(entries(formData, ["id", "attendance"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { id, attendance } = parsed.data;
  try {
    const outcome = await setAttendanceRecord(prisma, id, attendance, actor.actorId);
    if (outcome) return outcome;
  } catch (error) {
    const failure = ruleFailure(error);
    if (failure) return failure;
    throw error;
  }

  revalidatePath(AGENDA_PATH);
  revalidatePath(`${AGENDA_PATH}/${id}`);
  return { ok: true, message: attendance ? "Presença registrada." : "Marcação de presença removida." };
}

// --- Bloqueios de horário (MEL-02, #45) --------------------------------------------------------
// `agenda:gerir` (Recepção, Fisioterapeuta e Administrador), para qualquer fisioterapeuta ativo.
// Bloqueio sobre agendamento AGENDADO é recusado com a lista dos agendamentos; sem edição (remove e
// cria outro) e sem exclusão física.
export async function createScheduleBlock(
  _prev: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = blockSchema.safeParse(
    entries(formData, ["professionalId", "startDate", "startTime", "endDate", "endTime", "reason"]),
  );
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    await insertScheduleBlock(prisma, parsed.data, actor.actorId);
  } catch (error) {
    const failure = ruleFailure(error);
    if (failure) return failure;
    throw error;
  }
  revalidatePath(AGENDA_PATH);
  revalidatePath(BLOCKS_PATH);
  redirect(`${BLOCKS_PATH}?${new URLSearchParams({ professionalId: parsed.data.professionalId })}`);
}

export async function removeBlock(_prev: AppointmentActionState, formData: FormData): Promise<AppointmentActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = removeBlockSchema.safeParse(entries(formData, ["id"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const outcome = await removeScheduleBlock(prisma, parsed.data.id, actor.actorId);
  if (outcome) return outcome;
  revalidatePath(AGENDA_PATH);
  revalidatePath(BLOCKS_PATH);
  return { ok: true, message: "Bloqueio removido." };
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
