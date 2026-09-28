// Validação do painel de configurações (issue #63). Tudo é revalidado no servidor; o formulário
// só repete as regras para o feedback imediato.
import { z } from "zod";
import { normalizeName } from "@/lib/names";
import { onlyDigits } from "@/modules/pacientes/validation";
import { AGENDA_VIEWS, DEFAULT_SETTINGS, SETTINGS_LIMITS, isValidCnpj } from "./settings";

const optionalText = (label: string, max: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value ?? "").trim())
    .pipe(z.string().max(max, { error: `${label} deve ter no máximo ${max} caracteres.` }))
    .transform((value) => (value ? value : null));

// Nomes institucionais em maiúsculas (contrato de nomes, #78).
const optionalName = (label: string, max: number) =>
  z
    .string()
    .optional()
    .transform((value) => normalizeName(value ?? ""))
    .pipe(z.string().max(max, { error: `${label} deve ter no máximo ${max} caracteres.` }))
    .transform((value) => (value ? value : null));

const cnpj = z
  .string()
  .optional()
  .transform((value) => onlyDigits(value ?? ""))
  .refine((value) => value === "" || isValidCnpj(value), { error: "Informe um CNPJ válido." })
  .transform((value) => (value ? value : null));

const phone = z
  .string()
  .optional()
  .transform((value) => onlyDigits(value ?? ""))
  .refine((value) => value === "" || /^\d{10,11}$/.test(value), {
    error: "Informe um telefone válido com DDD (10 ou 11 dígitos).",
  })
  .transform((value) => (value ? value : null));

const email = z
  .string()
  .optional()
  .transform((value) => (value ?? "").trim().toLowerCase())
  .pipe(
    z.union([
      z.literal(""),
      z.email({ error: "Informe um e-mail válido." }).max(SETTINGS_LIMITS.email, { error: "E-mail muito longo." }),
    ]),
  )
  .transform((value) => (value ? value : null));

const hour = (label: string, min: number, max: number) =>
  z
    .string({ error: `Informe ${label}.` })
    .trim()
    .regex(/^\d{1,2}$/, { error: `Informe ${label} em horas inteiras.` })
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(min, { error: `${label[0].toUpperCase()}${label.slice(1)} deve estar entre ${min} e ${max}.` })
        .max(max, { error: `${label[0].toUpperCase()}${label.slice(1)} deve estar entre ${min} e ${max}.` }),
    );

const DURATION_RANGE = `A duração deve estar entre ${SETTINGS_LIMITS.minDuration} e ${SETTINGS_LIMITS.maxDuration} minutos.`;

// Em branco = desligada (null). Sem união do zod, para a mensagem de erro sair sempre em pt-BR.
const duration = z
  .string()
  .optional()
  .transform((value, ctx) => {
    const text = (value ?? "").trim();
    if (text === "") return null;
    if (!/^\d{1,3}$/.test(text)) {
      ctx.addIssue({ code: "custom", message: "Informe a duração em minutos inteiros." });
      return z.NEVER;
    }
    const minutes = Number(text);
    if (minutes < SETTINGS_LIMITS.minDuration || minutes > SETTINGS_LIMITS.maxDuration) {
      ctx.addIssue({ code: "custom", message: DURATION_RANGE });
      return z.NEVER;
    }
    return minutes;
  });

// Visão inicial da agenda (#69): só as visões existentes; ausente = padrão (dia), como os demais
// campos com padrão. Valor desconhecido é recusado, com mensagem própria em pt-BR.
const agendaView = z
  .string()
  .optional()
  .transform((value, ctx) => {
    const text = (value ?? "").trim();
    if (text === "") return DEFAULT_SETTINGS.agendaDefaultView;
    const view = AGENDA_VIEWS.find((item) => item === text);
    if (!view) {
      ctx.addIssue({ code: "custom", message: "Escolha a visão inicial da agenda: Dia, Semana ou Lista." });
      return z.NEVER;
    }
    return view;
  });

// Checkbox: presente = "on"; ausente = desligado.
const checkbox = z
  .string()
  .optional()
  .transform((value) => value === "on" || value === "true");

export const settingsSchema = z
  .object({
    displayName: optionalName("O nome de exibição", SETTINGS_LIMITS.displayName),
    legalName: optionalName("A razão social", SETTINGS_LIMITS.legalName),
    cnpj,
    phone,
    email,
    address: optionalText("O endereço", SETTINGS_LIMITS.address),
    agendaDayStartHour: hour("o início da faixa", 0, 23),
    agendaDayEndHour: hour("o fim da faixa", 1, 24),
    suggestedDurationMinutes: duration,
    agendaDefaultView: agendaView,
    printShowClinicInfo: checkbox,
    // Versão lida quando o formulário abriu (0 = nunca salvo).
    expectedVersion: z.coerce.number().int().min(0).max(1_000_000_000),
  })
  .refine((data) => data.agendaDayEndHour > data.agendaDayStartHour, {
    path: ["agendaDayEndHour"],
    error: "O fim da faixa deve ser depois do início.",
  });

export type SettingsInput = z.infer<typeof settingsSchema>;
