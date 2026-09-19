import { z } from "zod";

export const PATIENT_STATUSES = ["ATIVO", "INATIVO"] as const;
export type PatientStatusValue = (typeof PATIENT_STATUSES)[number];

export const PATIENT_STATUS_LABELS: Record<PatientStatusValue, string> = {
  ATIVO: "Ativo",
  INATIVO: "Inativo",
};

// Opções de sexo definidas pela clínica (Fase 2c).
export const SEXES = ["FEMININO", "MASCULINO", "NAO_INFORMADO"] as const;
export type SexValue = (typeof SEXES)[number];

export const SEX_LABELS: Record<SexValue, string> = {
  FEMININO: "Feminino",
  MASCULINO: "Masculino",
  NAO_INFORMADO: "Não informado",
};

export const OCCUPATION_MAX = 120;

export const ADULT_AGE = 18;
export const PAGE_SIZE = 20;

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

// Dígitos verificadores do CPF (módulo 11). Recusa sequências repetidas (ex.: 111.111.111-11).
export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function formatCpf(cpf: string) {
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

export function formatPhone(phone: string) {
  if (phone.length === 11) return phone.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (phone.length === 10) return phone.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return phone;
}

// Data civil "hoje" (UTC). birthDate é @db.Date, então comparamos só ano/mês/dia.
function today(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function ageOn(birthDate: Date, now = new Date()) {
  const ref = today(now);
  let age = ref.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    ref.getUTCMonth() < birthDate.getUTCMonth() ||
    (ref.getUTCMonth() === birthDate.getUTCMonth() && ref.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

export function isMinor(birthDate: Date, now = new Date()) {
  return ageOn(birthDate, now) < ADULT_AGE;
}

// Campo de texto opcional: vazio vira null.
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} deve ter no máximo ${max} caracteres.` })
    .optional()
    .transform((value) => (value ? value : null));

const phone = (label: string) =>
  z
    .string({ error: `Informe o ${label}.` })
    .transform(onlyDigits)
    .pipe(
      z
        .string()
        .min(1, { error: `Informe o ${label}.` })
        .regex(/^\d{10,11}$/, { error: `Informe um ${label} válido com DDD (10 ou 11 dígitos).` }),
    );

const birthDate = z
  .string({ error: "Informe a data de nascimento." })
  .trim()
  .min(1, { error: "Informe a data de nascimento." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe uma data válida." })
  .transform((value, ctx) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      ctx.addIssue({ code: "custom", message: "Informe uma data válida." });
      return z.NEVER;
    }
    if (date.getTime() > today(new Date()).getTime()) {
      ctx.addIssue({ code: "custom", message: "A data de nascimento não pode ser futura." });
      return z.NEVER;
    }
    if (date.getUTCFullYear() < 1900) {
      ctx.addIssue({ code: "custom", message: "Informe uma data a partir de 1900." });
      return z.NEVER;
    }
    return date;
  });

const cpf = z
  .string()
  .optional()
  .transform((value) => onlyDigits(value ?? ""))
  .refine((value) => value === "" || isValidCpf(value), { error: "Informe um CPF válido." })
  .transform((value) => (value ? value : null));

const email = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((value) => value ?? "")
  .pipe(
    z.union([
      z.literal(""),
      z.email({ error: "Informe um e-mail válido." }).max(254, { error: "E-mail muito longo." }),
    ]),
  )
  .transform((value) => (value ? value : null));

const optionalPhone = z
  .string()
  .optional()
  .transform((value) => onlyDigits(value ?? ""))
  .refine((value) => value === "" || /^\d{10,11}$/.test(value), {
    error: "Informe um telefone válido com DDD (10 ou 11 dígitos).",
  })
  .transform((value) => (value ? value : null));

const patientFields = z.object({
  fullName: z
    .string({ error: "Informe o nome completo." })
    .trim()
    .min(2, { error: "O nome deve ter pelo menos 2 caracteres." })
    .max(120, { error: "O nome deve ter no máximo 120 caracteres." }),
  birthDate,
  // Obrigatório em criação e edição; "Não informado" é uma opção explícita.
  sex: z.enum(SEXES, { error: "Selecione o sexo." }),
  occupation: optionalText(OCCUPATION_MAX, "A profissão"),
  cpf,
  phone: phone("telefone"),
  email,
  address: optionalText(300, "O endereço"),
  notes: optionalText(1000, "As observações"),
  guardianName: optionalText(120, "O nome do responsável"),
  guardianPhone: optionalPhone,
  guardianRelationship: optionalText(60, "O parentesco"),
});

type PatientFields = z.infer<typeof patientFields>;

// Menor de idade exige nome e telefone do responsável legal. Para adultos, os dados do
// responsável são descartados (mínimo necessário).
function applyGuardianRule<T extends PatientFields>(data: T, ctx: z.RefinementCtx): T {
  if (!isMinor(data.birthDate)) {
    return { ...data, guardianName: null, guardianPhone: null, guardianRelationship: null };
  }
  if (!data.guardianName) {
    ctx.addIssue({ code: "custom", path: ["guardianName"], message: "Informe o nome do responsável legal (paciente menor de idade)." });
  }
  if (!data.guardianPhone) {
    ctx.addIssue({ code: "custom", path: ["guardianPhone"], message: "Informe o telefone do responsável legal (paciente menor de idade)." });
  }
  return data;
}

const id = z.string().min(1).max(64);

export const patientSchema = patientFields.transform(applyGuardianRule);
export const updatePatientSchema = patientFields.extend({ id }).transform(applyGuardianRule);

export const setPatientStatusSchema = z.object({
  id,
  status: z.enum(PATIENT_STATUSES),
});

// Parâmetros da listagem vindos da URL: valores inválidos caem no padrão, nunca em erro.
export const listPatientsSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .catch(undefined)
    .transform((value) => value || undefined),
  status: z.enum(PATIENT_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export type ListPatientsParams = { q?: string; status?: PatientStatusValue; page: number };

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
