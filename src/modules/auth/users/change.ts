// Alteração de usuário pelo Administrador (nome, e-mail, perfil, CREFITO, ativo) sobre um cliente
// Prisma qualquer. Sem `server-only`, para a integração exercitar exatamente esta transação (#78).
//
// Transação serializável, com as salvaguardas conferidas contra o estado atual do banco (evita
// corrida entre dois admins). Tudo ou nada: e-mail ou CREFITO repetido (P2002) desfaz também os
// demais campos. Troca de e-mail (#78): encerra as sessões do usuário alterado; se ele for o próprio
// Administrador, mantém só a sessão atual (keepTokenHash). ID, senha, vínculos e autoria histórica não
// mudam. A auditoria recebe só os nomes dos campos alterados, nunca valores.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { AuditAction, Role } from "@/generated/prisma/enums";
import { writeAudit } from "@/modules/auditoria/write";
import { ROLES, can } from "../permissions";
import { checkUserChange } from "../safeguards";

export type UserChangeActor = { actorId: string; actorRole: Role; ip: string | null };
export type UserChange = { name?: string; email?: string; role?: Role; crefito?: string | null; active?: boolean };

// Falha de regra (usuário inexistente ou salvaguarda): a mensagem vai para a interface.
export class UserChangeError extends Error {}

const MANAGER_ROLES: Role[] = ROLES.filter((role) => can(role, "usuarios:gerir"));

// Nomes dos campos alterados para o resumo da auditoria (sem valores).
const FIELD_LABELS = { name: "nome", email: "e-mail", role: "perfil", crefito: "CREFITO" } as const;

// Registro de auditoria de uma alteração de usuário, na transação dela (A8).
export function auditEntry(actor: UserChangeActor, action: AuditAction, targetUserId: string, details?: string | null) {
  return {
    action,
    result: "SUCESSO" as const,
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    targetUserId,
    ip: actor.ip,
    details: details ?? null,
  };
}

// Ação registrada: ativação/desativação, troca de perfil ou edição simples.
function changeAction(target: { role: Role; active: boolean }, data: UserChange): AuditAction {
  if (data.active !== undefined) return data.active ? "USUARIO_ATIVADO" : "USUARIO_DESATIVADO";
  if (data.role !== undefined && data.role !== target.role) return "PERFIL_ALTERADO";
  return "USUARIO_EDITADO";
}

export async function changeUser(
  db: Pick<PrismaClient, "$transaction">,
  actor: UserChangeActor,
  id: string,
  data: UserChange,
  keepTokenHash: string | null = null,
) {
  await db.$transaction(
    async (tx) => {
      const target = await tx.user.findUnique({
        where: { id },
        select: { id: true, role: true, active: true, name: true, email: true, crefito: true },
      });
      if (!target) throw new UserChangeError("Usuário não encontrado.");
      const activeManagerCount = await tx.user.count({ where: { active: true, role: { in: MANAGER_ROLES } } });
      const problem = checkUserChange({ actorId: actor.actorId, target, next: data, activeManagerCount });
      if (problem) throw new UserChangeError(problem);
      await tx.user.update({ where: { id }, data });
      if (data.active === false) await tx.session.deleteMany({ where: { userId: id } });
      if (data.email !== undefined && data.email !== target.email) {
        const keep = id === actor.actorId && keepTokenHash ? { tokenHash: { not: keepTokenHash } } : {};
        await tx.session.deleteMany({ where: { userId: id, ...keep } });
      }
      const changed = (Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]).filter(
        (field) => data[field] !== undefined && data[field] !== target[field],
      );
      const details = changed.length ? `Campos: ${changed.map((field) => FIELD_LABELS[field]).join(", ")}.` : null;
      await writeAudit(tx, auditEntry(actor, changeAction(target, data), id, details));
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
