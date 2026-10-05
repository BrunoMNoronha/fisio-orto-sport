// Mapa central de permissões por perfil. Toda checagem de acesso passa por `can()`.
// A matriz é uma SUPOSIÇÃO conservadora registrada em docs/PROJECT.md (a validar).
import type { Role } from "@/generated/prisma/enums";

export const PERMISSIONS = [
  "usuarios:ler",
  "usuarios:gerir",
  "pacientes:ler",
  "pacientes:gerir",
  "agenda:ler",
  "agenda:gerir",
  "clinico:ler",
  "clinico:gerir",
  // Trilha de auditoria de login e gestão de usuários (issue #56, decisão A4): só Administrador.
  "auditoria:ler",
  // Painel de configurações da clínica (issue #63): só Administrador. Os demais perfis só recebem,
  // no servidor, os valores de que seus fluxos precisam, sem acesso ao painel.
  "configuracoes:ler",
  "configuracoes:gerir",
  // Cobranças manuais (FIN-01, #86): os três perfis consultam e operam todos os pacientes, com
  // alcance igual (decisão de Bruno em 04/10/2026). Não dá acesso a conteúdo clínico.
  "financeiro:ler",
  "financeiro:gerir",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["ADMIN", "RECEPCAO", "FISIOTERAPEUTA"] as const satisfies readonly Role[];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  // Recepção: dados cadastrais e agenda; sem dados clínicos.
  RECEPCAO: ["pacientes:ler", "pacientes:gerir", "agenda:ler", "agenda:gerir", "financeiro:ler", "financeiro:gerir"],
  // Fisioterapeuta: tudo o que a Recepção pode (cadastro e agenda de todos os pacientes e
  // profissionais, decisão da issue #31) mais os dados clínicos. Nunca `usuarios:*`.
  // Contrato testado: permissões de RECEPCAO ⊆ permissões de FISIOTERAPEUTA.
  FISIOTERAPEUTA: [
    "pacientes:ler",
    "pacientes:gerir",
    "agenda:ler",
    "agenda:gerir",
    "clinico:ler",
    "clinico:gerir",
    "financeiro:ler",
    "financeiro:gerir",
  ],
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  RECEPCAO: "Recepção",
  FISIOTERAPEUTA: "Fisioterapeuta",
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
