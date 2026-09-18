// Regras que protegem o acesso administrativo. Funções puras, testáveis sem banco.
import type { Role } from "@/generated/prisma/enums";
import { can } from "./permissions";

type UserState = { id: string; role: Role; active: boolean };

export type UserChangeInput = {
  actorId: string;
  target: UserState;
  next: { role?: Role; active?: boolean };
  // Usuários ativos que podem gerir usuários (inclui o alvo, se for o caso).
  activeManagerCount: number;
};

// Devolve a mensagem de erro, ou null se a alteração for permitida.
export function checkUserChange({ actorId, target, next, activeManagerCount }: UserChangeInput): string | null {
  const isSelf = actorId === target.id;
  const willBeActive = next.active ?? target.active;
  const willBeRole = next.role ?? target.role;

  if (isSelf && !willBeActive) return "Você não pode desativar a sua própria conta.";

  const isManagerNow = target.active && can(target.role, "usuarios:gerir");
  const isManagerAfter = willBeActive && can(willBeRole, "usuarios:gerir");

  if (isManagerNow && !isManagerAfter) {
    if (isSelf) return "Você não pode remover o seu próprio perfil de Administrador.";
    if (activeManagerCount <= 1) return "Não é possível remover o último Administrador ativo.";
  }
  return null;
}
