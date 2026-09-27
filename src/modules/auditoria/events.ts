// Tipos, rótulos e regras puras da trilha de auditoria (issue #56). Sem `server-only`: também é
// usado pelo `pnpm db:admin`, que roda fora do Next.
import { createHash } from "node:crypto";
import type { AuditAction, AuditResult, Role } from "@/generated/prisma/enums";

// Retenção decidida em A5 (Bruno, 26/09/2026): decisão operacional, não prazo legal. O mesmo
// valor está no trigger "AuditLog_guard" da migração auditoria; mude os dois juntos.
export const AUDIT_RETENTION_DAYS = 7;

// Campos decididos em A6. Não inclua senha, token, user-agent nem conteúdo clínico.
export type AuditEntry = {
  action: AuditAction;
  result: AuditResult;
  actorId?: string | null;
  actorRole?: Role | null;
  targetUserId?: string | null;
  emailHash?: string | null;
  ip?: string | null;
  // Só resumo sem valores (ex.: versão e nomes dos campos de uma configuração, issue #63).
  details?: string | null;
};

// E-mail digitado numa falha de login: só o SHA-256 do valor normalizado, como nas chaves dos
// limites de tentativa. Permite agrupar tentativas contra o mesmo e-mail sem guardá-lo em claro.
export function hashEmail(email: string) {
  return createHash("sha256").update(`audit-email:${email.trim().toLowerCase()}`).digest("hex");
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN: "Login",
  LOGOUT: "Logout",
  ACESSO_NEGADO: "Acesso negado",
  PRIMEIRO_ADMIN_CRIADO: "Primeiro Administrador criado",
  USUARIO_CRIADO: "Usuário criado",
  USUARIO_EDITADO: "Usuário editado",
  PERFIL_ALTERADO: "Perfil alterado",
  USUARIO_ATIVADO: "Usuário ativado",
  USUARIO_DESATIVADO: "Usuário desativado",
  SENHA_REDEFINIDA: "Senha redefinida",
  CLI_ADMIN_CRIADO: "Administrador criado (db:admin)",
  CLI_SENHA_REDEFINIDA: "Senha redefinida (db:admin)",
  CONFIGURACAO_ALTERADA: "Configurações alteradas",
};

export const AUDIT_RESULT_LABELS: Record<AuditResult, string> = {
  SUCESSO: "Sucesso",
  FALHA: "Falha",
  BLOQUEADO: "Bloqueado",
  NEGADO: "Negado",
};

export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];
