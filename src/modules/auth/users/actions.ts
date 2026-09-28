"use server";

// Gestão de usuários pelo Administrador. Cada action checa a permissão no servidor,
// independentemente de a UI esconder os botões.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requestIp } from "@/modules/auditoria/record";
import { writeAudit } from "@/modules/auditoria/write";
import { AuthorizationError, assertPermission } from "../dal";
import { hashPassword } from "../password";
import { currentSessionTokenHash } from "../session";
import { UserChangeError, auditEntry, changeUser, type UserChangeActor } from "./change";
import { UserDeleteError, deleteDeactivatedUser } from "./delete";
import {
  createUserSchema,
  deleteUserSchema,
  fieldErrors,
  resetPasswordSchema,
  setUserActiveSchema,
  updateUserSchema,
  type FieldErrors,
} from "../validation";

export type UserActionState =
  | { ok?: boolean; message?: string; error?: string; fieldErrors?: FieldErrors }
  | undefined;

const USERS_PATH = "/usuarios";

// Não ecoam o valor informado.
const DUPLICATE_CREFITO: UserActionState = { fieldErrors: { crefito: ["Já existe um usuário com este CREFITO."] } };
const DUPLICATE_EMAIL: UserActionState = { fieldErrors: { email: ["Já existe um usuário com este e-mail."] } };

type Actor = UserChangeActor;

async function guard(): Promise<Actor | UserActionState> {
  try {
    const actor = await assertPermission("usuarios:gerir");
    return { actorId: actor.id, actorRole: actor.role, ip: await requestIp() };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: "Acesso negado." };
    throw error;
  }
}

function isActor(value: unknown): value is Actor {
  return typeof value === "object" && value !== null && "actorId" in value;
}

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// P2002 em User pode vir do e-mail ou do CREFITO. O formato de `meta` varia com o adapter,
// então procuramos o nome da coluna em qualquer parte dele.
function violatesCrefito(error: Prisma.PrismaClientKnownRequestError) {
  return JSON.stringify(error.meta ?? {}).includes("crefito");
}

function entries(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, formData.get(key) ?? undefined]));
}

async function runChange(fn: () => Promise<void>, success: string): Promise<UserActionState> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof UserChangeError) return { error: error.message };
    if (isUniqueViolation(error)) return violatesCrefito(error) ? DUPLICATE_CREFITO : DUPLICATE_EMAIL;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "Outra alteração ocorreu ao mesmo tempo. Tente novamente." };
    }
    throw error;
  }
  revalidatePath(USERS_PATH);
  return { ok: true, message: success };
}

export async function createUser(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = createUserSchema.safeParse(entries(formData, ["name", "email", "role", "crefito", "password"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { password, ...data } = parsed.data;
  const passwordHash = await hashPassword(password);
  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { ...data, passwordHash }, select: { id: true } });
      await writeAudit(tx, auditEntry(actor, "USUARIO_CRIADO", created.id));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return violatesCrefito(error) ? DUPLICATE_CREFITO : DUPLICATE_EMAIL;
    }
    throw error;
  }
  revalidatePath(USERS_PATH);
  return { ok: true, message: "Usuário criado." };
}

export async function updateUser(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = updateUserSchema.safeParse(entries(formData, ["id", "name", "email", "role", "crefito"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { id, ...data } = parsed.data;
  const keepTokenHash = id === actor.actorId ? await currentSessionTokenHash() : null;
  return runChange(() => changeUser(prisma, actor, id, data, keepTokenHash), "Usuário atualizado.");
}

export async function setUserActive(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = setUserActiveSchema.safeParse(entries(formData, ["id", "active"]));
  if (!parsed.success) return { error: "Dados inválidos." };

  const { id, active } = parsed.data;
  return runChange(
    () => changeUser(prisma, actor, id, { active }),
    active ? "Usuário ativado." : "Usuário desativado.",
  );
}

export async function resetPassword(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = resetPasswordSchema.safeParse(entries(formData, ["id", "password"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { id, password } = parsed.data;
  const passwordHash = await hashPassword(password);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({ where: { id }, data: { passwordHash } });
    // Encerra as sessões abertas com a senha antiga.
    if (result.count > 0) {
      await tx.session.deleteMany({ where: { userId: id } });
      await writeAudit(tx, auditEntry(actor, "SENHA_REDEFINIDA", id));
    }
    return result.count;
  });
  if (updated === 0) return { error: "Usuário não encontrado." };

  revalidatePath(USERS_PATH);
  return { ok: true, message: "Senha redefinida. As sessões do usuário foram encerradas." };
}

// Exclusão definitiva de conta desativada e sem vínculos (issue #76). Estado, vínculos e
// autoexclusão são conferidos no servidor, na transação; a interface só esconde o botão.
export async function deleteUser(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = deleteUserSchema.safeParse(entries(formData, ["id"]));
  if (!parsed.success) return { error: "Dados inválidos." };

  try {
    await deleteDeactivatedUser(prisma, actor, parsed.data.id);
  } catch (error) {
    if (error instanceof UserDeleteError) {
      revalidatePath(USERS_PATH);
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath(USERS_PATH);
  return { ok: true, message: "Usuário excluído." };
}
