// Exclusão de usuário desativado pelo Administrador (issue #76). Sem `server-only`, para a
// integração exercitar exatamente esta transação.
//
// Regra: só se exclui fisicamente uma conta DESATIVADA, que não seja a do próprio executor e que
// não tenha nenhum vínculo de negócio (pacientes, agenda, bloqueios, prontuário ou configurações).
// Com vínculo, a conta fica desativada e a mensagem diz as categorias, sem mostrar registros. Nada
// é apagado em cascata, transferido ou anonimizado. Sessões de login residuais são removidas, e a
// auditoria anterior fica (AuditLog guarda só ids, sem FK). O evento USUARIO_EXCLUIDO entra na
// mesma transação: se falhar, a exclusão é desfeita.
//
// Concorrência: a linha do usuário é travada (FOR UPDATE) antes de conferir estado e vínculos.
// Reativação, outra exclusão e a gravação de um vínculo novo (a FK trava a mesma linha) esperam, e
// a checagem enxerga o que já foi confirmado. As FKs `Restrict` continuam como última barreira.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { writeAudit } from "@/modules/auditoria/write";

type Db = Pick<PrismaClient, "$transaction">;
type Tx = Prisma.TransactionClient;

// Todas as FKs para User, exceto Session (sessão de login, removida junto). Um teste compara esta
// lista com o banco: FK nova para User sem entrada aqui faz o teste falhar.
export const USER_LINKS = [
  { table: "Patient", column: "createdById", category: "pacientes" },
  { table: "Patient", column: "updatedById", category: "pacientes" },
  { table: "Appointment", column: "professionalId", category: "agenda" },
  { table: "Appointment", column: "createdById", category: "agenda" },
  { table: "Appointment", column: "updatedById", category: "agenda" },
  { table: "Appointment", column: "cancelledById", category: "agenda" },
  { table: "Appointment", column: "attendanceMarkedById", category: "agenda" },
  { table: "ScheduleBlock", column: "professionalId", category: "bloqueios" },
  { table: "ScheduleBlock", column: "createdById", category: "bloqueios" },
  { table: "ScheduleBlock", column: "removedById", category: "bloqueios" },
  { table: "Anamnesis", column: "authorId", category: "prontuario" },
  { table: "Assessment", column: "authorId", category: "prontuario" },
  { table: "AssessmentChange", column: "editorId", category: "prontuario" },
  { table: "TherapyPlan", column: "authorId", category: "prontuario" },
  { table: "TherapyPlanRevision", column: "authorId", category: "prontuario" },
  { table: "TherapyPlanStatusChange", column: "authorId", category: "prontuario" },
  { table: "TreatmentSession", column: "professionalId", category: "prontuario" },
  { table: "TreatmentSession", column: "authorId", category: "prontuario" },
  { table: "TreatmentSession", column: "invalidatedById", category: "prontuario" },
  { table: "TreatmentSessionChange", column: "editorId", category: "prontuario" },
  { table: "Reassessment", column: "authorId", category: "prontuario" },
  { table: "ReassessmentChange", column: "editorId", category: "prontuario" },
  { table: "ClinicSettings", column: "updatedById", category: "configuracoes" },
] as const;

export type LinkCategory = (typeof USER_LINKS)[number]["category"];

export const LINK_CATEGORY_LABELS: Record<LinkCategory, string> = {
  pacientes: "cadastro de pacientes",
  agenda: "agendamentos",
  bloqueios: "bloqueios de agenda",
  prontuario: "registros de prontuário (anamneses, avaliações, planos, atendimentos ou reavaliações)",
  configuracoes: "configurações da clínica",
};

export class UserDeleteError extends Error {}

export const USER_NOT_FOUND = "Usuário não encontrado. Ele pode já ter sido excluído.";
export const SELF_DELETE = "Você não pode excluir a sua própria conta.";
export const ACTIVE_USER = "Só é possível excluir usuários desativados. Desative a conta antes.";

export function linkedMessage(categories: LinkCategory[]) {
  const labels = categories.map((category) => LINK_CATEGORY_LABELS[category]);
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}` : labels[0];
  return `Este usuário não pode ser excluído porque está vinculado a ${list}. A conta continua desativada, e o histórico é preservado.`;
}

// Categorias de vínculo existentes, na ordem do catálogo. Só existência, nunca os registros.
export async function linkedCategories(tx: Tx, userId: string): Promise<LinkCategory[]> {
  const found = new Set<LinkCategory>();
  for (const link of USER_LINKS) {
    if (found.has(link.category)) continue;
    const [row] = await tx.$queryRawUnsafe<{ linked: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM "${link.table}" WHERE "${link.column}" = $1) AS linked`,
      userId,
    );
    if (row.linked) found.add(link.category);
  }
  return (Object.keys(LINK_CATEGORY_LABELS) as LinkCategory[]).filter((category) => found.has(category));
}

// Violação de FK (SQLSTATE 23503). Com o driver adapter, o código do PostgreSQL pode vir aninhado.
export function isForeignKeyViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    if (record.code === "P2003") return true;
    const text = `${String(record.message ?? "")} ${String(record.code ?? "")} ${JSON.stringify(record.meta ?? {})}`;
    if (text.includes("23503") || /foreign key/i.test(text)) return true;
    current = record.cause;
  }
  return false;
}

export type DeleteActor = { actorId: string; actorRole: Role; ip: string | null };

export async function deleteDeactivatedUser(db: Db, actor: DeleteActor, targetId: string): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      const [target] = await tx.$queryRaw<{ id: string; active: boolean }[]>`
        SELECT "id", "active" FROM "User" WHERE "id" = ${targetId} FOR UPDATE`;
      if (!target) throw new UserDeleteError(USER_NOT_FOUND);
      if (target.id === actor.actorId) throw new UserDeleteError(SELF_DELETE);
      if (target.active) throw new UserDeleteError(ACTIVE_USER);

      const categories = await linkedCategories(tx, targetId);
      if (categories.length) throw new UserDeleteError(linkedMessage(categories));

      await tx.session.deleteMany({ where: { userId: targetId } });
      await tx.user.delete({ where: { id: targetId }, select: { id: true } });
      await writeAudit(tx, {
        action: "USUARIO_EXCLUIDO",
        result: "SUCESSO",
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        targetUserId: targetId,
        ip: actor.ip,
      });
    });
  } catch (error) {
    // Última barreira: um vínculo gravado por um caminho que não passou pela checagem.
    if (isForeignKeyViolation(error)) {
      throw new UserDeleteError(
        "Este usuário não pode ser excluído porque ainda tem vínculos no sistema. A conta continua desativada.",
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new UserDeleteError(USER_NOT_FOUND);
    }
    throw error;
  }
}
