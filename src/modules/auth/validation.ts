import { z } from "zod";
import { ROLES } from "./permissions";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const email = z
  .string({ error: "Informe o e-mail." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Informe um e-mail válido." }).max(254, { error: "E-mail muito longo." }));

const password = z
  .string({ error: "Informe a senha." })
  .min(PASSWORD_MIN, { error: `A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.` })
  .max(PASSWORD_MAX, { error: `A senha deve ter no máximo ${PASSWORD_MAX} caracteres.` });

const name = z
  .string({ error: "Informe o nome." })
  .trim()
  .min(2, { error: "O nome deve ter pelo menos 2 caracteres." })
  .max(120, { error: "O nome deve ter no máximo 120 caracteres." });

const role = z.enum(ROLES, { error: "Selecione um perfil válido." });
const id = z.string().min(1).max(64);

export const CREFITO_MAX = 20;

// CREFITO: texto curto normalizado (espaços nas pontas removidos, espaços internos
// colapsados, maiúsculas), sem validação de padrão. Vazio vira null.
const crefito = z
  .string()
  .optional()
  .transform((value) => (value ?? "").trim().replace(/\s+/g, " ").toUpperCase())
  .pipe(z.string().max(CREFITO_MAX, { error: `O CREFITO deve ter no máximo ${CREFITO_MAX} caracteres.` }))
  .transform((value) => (value ? value : null));

// Fisioterapeuta precisa informar o CREFITO; nos demais perfis ele é descartado.
function applyCrefitoRule<T extends { role: (typeof ROLES)[number]; crefito: string | null }>(
  data: T,
  ctx: z.RefinementCtx,
): T {
  if (data.role !== "FISIOTERAPEUTA") return { ...data, crefito: null };
  if (!data.crefito) {
    ctx.addIssue({ code: "custom", path: ["crefito"], message: "Informe o CREFITO do fisioterapeuta." });
  }
  return data;
}

// No login não aplicamos a política de senha: a resposta é sempre a mensagem genérica.
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
});

// Cadastro do primeiro usuário (bootstrap). O perfil não vem do formulário: é sempre
// ADMIN, definido no servidor. Sem CREFITO — um Administrador não é fisioterapeuta.
export const firstUserSchema = z.object({ name, email, password });

export const createUserSchema = z.object({ name, email, role, crefito, password }).transform(applyCrefitoRule);
export const updateUserSchema = z.object({ id, name, role, crefito }).transform(applyCrefitoRule);
export const setUserActiveSchema = z.object({
  id,
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});
export const resetPasswordSchema = z.object({ id, password });

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export type FieldErrors = Partial<Record<string, string[]>>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}
