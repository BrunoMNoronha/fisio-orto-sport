import { z } from "zod";
import { CONTRACT_DEFAULTS } from "./contract-defaults";
import { normalizeName } from "@/lib/names";

const name = z.string().transform(normalizeName).pipe(z.string().min(1, "Informe o nome.").max(120, "Use até 120 caracteres."));
const optional = (max: number) => z.string().trim().max(max, `Use até ${max} caracteres.`).transform((v) => v || null);
const code = (digits: number, message: string) => optional(digits).refine((v) => v === null || new RegExp(`^\\d{${digits}}$`).test(v), message);
export const configurationMeta = {
  id: z.uuid("Identificador inválido."),
  requestId: z.uuid("Identificador de envio inválido."),
  expectedVersion: z.coerce.number().int().min(0).max(2147483646),
  reason: z.string().trim().min(1, "Informe o motivo do registro ou alteração.").max(300, "Use até 300 caracteres."),
};

export const operatorSchema = z.object({
  ...configurationMeta,
  name,
  registrationAns: code(6, "Informe os seis dígitos do registro ANS ou deixe pendente."),
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});
export const contractSchema = z.object({
  ...configurationMeta,
  operatorId: z.uuid("Operadora inválida."),
  name,
  providerCode: optional(30),
  cnes: code(7, "Informe os sete dígitos do CNES ou deixe pendente."),
  tissVersion: optional(8).refine((v) => v === null || /^\d{1,2}\.\d{2}\.\d{2}$/.test(v), "Use o formato 4.03.00 ou deixe pendente."),
  manualReference: optional(300),
  homologationChannel: optional(300).default(null),
  monthlySessions: z.coerce.number().int().min(1).max(1000000).default(CONTRACT_DEFAULTS.monthlySessions),
  closingIntervalDays: z.coerce.number().int().min(1).max(31).default(CONTRACT_DEFAULTS.closingIntervalDays),
  maxGuides: z.coerce.number().int().min(1).max(10000).default(CONTRACT_DEFAULTS.maxGuides),
  maxItems: z.coerce.number().int().min(1).max(100000).default(CONTRACT_DEFAULTS.maxItems),
  maxXmlBytes: z.coerce.number().int().min(1).max(20971520).default(CONTRACT_DEFAULTS.maxXmlBytes),
  maxExportRows: z.coerce.number().int().min(1).max(100000).default(CONTRACT_DEFAULTS.maxExportRows),

  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});
export type OperatorInput = z.output<typeof operatorSchema>;
export type ContractInput = z.output<typeof contractSchema>;

// Ausência de dados nunca equivale a homologação. Não testa registro real nem busca URLs.
export function contractPendingFields(contract: {
  providerCode: string | null; cnes: string | null; tissVersion: string | null; manualReference: string | null;
}, registrationAns: string | null): string[] {
  return [!registrationAns && "registro ANS", !contract.providerCode && "código do prestador",
    !contract.tissVersion && "versão TISS", !contract.manualReference && "referência do manual"]
    .filter((v): v is string => Boolean(v));
}

export const catalogFilters = z.object({
  q: z.string().trim().max(120).optional().default(""),
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
}).strict();
export const CATALOG_PAGE_SIZE = 20;
