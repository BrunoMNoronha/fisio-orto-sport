"use server";

// Cadastro de pacientes. Cada action checa `pacientes:gerir` no servidor, independentemente
// de a UI esconder os botões. Não há exclusão física: o paciente é inativado.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { AuthorizationError, assertPermission } from "@/modules/auth/dal";
import { fieldErrors, type FieldErrors } from "@/modules/auth/validation";
import { patientSchema, setPatientStatusSchema, updatePatientSchema } from "./validation";

export type PatientActionState =
  | { ok?: boolean; message?: string; error?: string; fieldErrors?: FieldErrors }
  | undefined;

const PATIENTS_PATH = "/pacientes";
const PATIENT_FIELDS = [
  "fullName",
  "birthDate",
  "cpf",
  "phone",
  "email",
  "address",
  "notes",
  "guardianName",
  "guardianPhone",
  "guardianRelationship",
];

// Não ecoa o CPF informado.
const DUPLICATE_CPF: PatientActionState = { fieldErrors: { cpf: ["Já existe um paciente com este CPF."] } };
const NOT_FOUND: PatientActionState = { error: "Paciente não encontrado." };

async function guard(): Promise<{ actorId: string } | PatientActionState> {
  try {
    const actor = await assertPermission("pacientes:gerir");
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

function knownError(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export async function createPatient(_prev: PatientActionState, formData: FormData): Promise<PatientActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = patientSchema.safeParse(entries(formData, PATIENT_FIELDS));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  let id: string;
  try {
    const created = await prisma.patient.create({
      data: { ...parsed.data, createdById: actor.actorId, updatedById: actor.actorId },
      select: { id: true },
    });
    id = created.id;
  } catch (error) {
    if (knownError(error, "P2002")) return DUPLICATE_CPF;
    throw error;
  }
  revalidatePath(PATIENTS_PATH);
  redirect(`${PATIENTS_PATH}/${id}`);
}

export async function updatePatient(_prev: PatientActionState, formData: FormData): Promise<PatientActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = updatePatientSchema.safeParse(entries(formData, ["id", ...PATIENT_FIELDS]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { id, ...data } = parsed.data;
  try {
    await prisma.patient.update({ where: { id }, data: { ...data, updatedById: actor.actorId }, select: { id: true } });
  } catch (error) {
    if (knownError(error, "P2002")) return DUPLICATE_CPF;
    if (knownError(error, "P2025")) return NOT_FOUND;
    throw error;
  }
  revalidatePath(PATIENTS_PATH);
  revalidatePath(`${PATIENTS_PATH}/${id}`);
  redirect(`${PATIENTS_PATH}/${id}`);
}

export async function setPatientStatus(_prev: PatientActionState, formData: FormData): Promise<PatientActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = setPatientStatusSchema.safeParse(entries(formData, ["id", "status"]));
  if (!parsed.success) return { error: "Dados inválidos." };

  const { id, status } = parsed.data;
  const result = await prisma.patient.updateMany({ where: { id }, data: { status, updatedById: actor.actorId } });
  if (result.count === 0) return NOT_FOUND;

  revalidatePath(PATIENTS_PATH);
  revalidatePath(`${PATIENTS_PATH}/${id}`);
  return { ok: true, message: status === "ATIVO" ? "Paciente reativado." : "Paciente inativado." };
}
