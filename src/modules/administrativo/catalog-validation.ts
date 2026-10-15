import { z } from "zod";
import { normalizeName } from "@/lib/names";
import { parseAmount } from "@/modules/financeiro/validation";
import { configurationMeta } from "./validation";

const optional = (max: number) => z.string().trim().max(max, `Use até ${max} caracteres.`).transform((v) => v || null);
const identifier = (max: number) => z.string().trim().min(1, "Informe o código.").max(max).regex(/^\S+$/, "O código não pode conter espaços.");
const name = (max: number) => z.string().transform(normalizeName).pipe(z.string().min(1, "Informe o nome.").max(max));
const active = z.enum(["true", "false"]).transform((v) => v === "true");

export function parseCivilDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= "2100-12-31" ? date : null;
}
const civilDate = z.string().transform((v, ctx) => {
  const date = parseCivilDate(v);
  if (date) return date;
  ctx.addIssue({ code: "custom", message: "Informe uma data válida entre 2000 e 2100." }); return z.NEVER;
});
export const procedureSchema = z.object({ ...configurationMeta, contractId: z.uuid(), name: name(160),
  tableCode: identifier(10), code: identifier(30), active });
export const tariffSchema = z.object({ ...configurationMeta, procedureId: z.uuid(),
  amount: z.string().transform((v, ctx) => {
    const result = parseAmount(v);
    if ("cents" in result) return result.cents;
    ctx.addIssue({ code: "custom", message: result.error }); return z.NEVER;
  }),
  startsOn: civilDate,
  endsOn: z.union([z.literal("").transform(() => null), civilDate]), active,
}).refine((v) => v.endsOn === null || v.endsOn >= v.startsOn, { path: ["endsOn"], message: "O fim da vigência não pode anteceder o início." });

export const PROFESSIONAL_PURPOSES = { SOLICITANTE: "Solicitante", EXECUTANTE: "Executante", AMBOS: "Solicitante e executante" } as const;
export const STATES = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;
export const professionalSchema = z.object({ ...configurationMeta, name: name(120),
  userId: optional(64).refine((v) => v === null || /^[a-z0-9]{1,64}$/i.test(v), "Usuário inválido."),
  purpose: z.enum(["SOLICITANTE", "EXECUTANTE", "AMBOS"], { error: "Escolha a atuação." }),
  councilCode: optional(2).refine((v) => v === null || /^\d{2}$/.test(v), "Informe os dois dígitos do código do conselho ou deixe pendente."),
  councilNumber: optional(20),
  councilState: z.union([z.literal("").transform(() => null), z.enum(STATES)]),
  occupationCode: optional(6).refine((v) => v === null || /^\d{6}$/.test(v), "Informe os seis dígitos do CBO ou deixe pendente."), active,
});
export type ProcedureInput = z.output<typeof procedureSchema>;
export type TariffInput = z.output<typeof tariffSchema>;
export type ProfessionalInput = z.output<typeof professionalSchema>;
