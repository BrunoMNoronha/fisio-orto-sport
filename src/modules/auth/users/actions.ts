"use server";

// Gestão de usuários pelo Administrador. Cada action checa a permissão no servidor,
// independentemente de a UI esconder os botões.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import type { AuditAction } from "@/generated/prisma/enums";
import { requestIp } from "@/modules/auditoria/record";
import { writeAudit } from "@/modules/auditoria/write";
import { AuthorizationError, assertPermission, type CurrentUser } from "../dal";
import { hashPassword } from "../password";
import { ROLES, can } from "../permissions";
import { checkUserChange } from "../safeguards";
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
const MANAGER_ROLES: Role[] = ROLES.filter((role) => can(role, "usuarios:gerir"));

class SafeguardError extends Error {}

// Não ecoa o valor informado.
const DUPLICATE_CREFITO: UserActionState = { fieldErrors: { crefito: ["Já existe um usuário com este CREFITO."] } };

type Actor = { actorId: string; actorRole: CurrentUser["role"]; ip: string | null };

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

// Registro de auditoria de uma alteração de usuário, na transação dela (A8).
function auditEntry(actor: Actor, action: AuditAction, targetUserId: string) {
  return { action, result: "SUCESSO" as const, actorId: actor.actorId, actorRole: actor.actorRole, targetUserId, ip: actor.ip };
}

// Ação registrada: ativação/desativação, troca de perfil ou edição simples.
function changeAction(target: { role: Role; active: boolean }, data: { role?: Role; active?: boolean }): AuditAction {
  if (data.active !== undefined) return data.active ? "USUARIO_ATIVADO" : "USUARIO_DESATIVADO";
  if (data.role !== undefined && data.role !== target.role) return "PERFIL_ALTERADO";
  return "USUARIO_EDITADO";
}

// Aplica a mudança de perfil/status numa transação serializável, validando as salvaguardas
// contra o estado atual do banco (evita corrida entre dois admins).
async function changeUser(
  actor: Actor,
  id: string,
  data: { name?: string; role?: Role; crefito?: string | null; active?: boolean },
) {
  await prisma.$transaction(
    async (tx) => {
      const target = await tx.user.findUnique({ where: { id }, select: { id: true, role: true, active: true } });
      if (!target) throw new SafeguardError("Usuário não encontrado.");
      const activeManagerCount = await tx.user.count({ where: { active: true, role: { in: MANAGER_ROLES } } });
      const problem = checkUserChange({ actorId: actor.actorId, target, next: data, activeManagerCount });
      if (problem) throw new SafeguardError(problem);
      await tx.user.update({ where: { id }, data });
      if (data.active === false) await tx.session.deleteMany({ where: { userId: id } });
      await writeAudit(tx, auditEntry(actor, changeAction(target, data), id));
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function runChange(fn: () => Promise<void>, success: string): Promise<UserActionState> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof SafeguardError) return { error: error.message };
    if (isUniqueViolation(error) && violatesCrefito(error)) return DUPLICATE_CREFITO;
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
      if (violatesCrefito(error)) return DUPLICATE_CREFITO;
      return { fieldErrors: { email: ["Já existe um usuário com este e-mail."] } };
    }
    throw error;
  }
  revalidatePath(USERS_PATH);
  return { ok: true, message: "Usuário criado." };
}

export async function updateUser(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = updateUserSchema.safeParse(entries(formData, ["id", "name", "role", "crefito"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { id, ...data } = parsed.data;
  return runChange(() => changeUser(actor, id, data), "Usuário atualizado.");
}

export async function setUserActive(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const actor = await guard();
  if (!isActor(actor)) return actor;

  const parsed = setUserActiveSchema.safeParse(entries(formData, ["id", "active"]));
  if (!parsed.success) return { error: "Dados inválidos." };

  const { id, active } = parsed.data;
  return runChange(
    () => changeUser(actor, id, { active }),
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
