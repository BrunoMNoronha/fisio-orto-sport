import { z } from "zod";
import { normalizeName } from "@/lib/names";
import { configurationMeta } from "./validation";
import { parseCivilDate } from "./catalog-validation";
const text = (max: number) => z.string().trim().min(1, "Preencha este campo.").max(max);
const optional = (max: number) => z.string().trim().max(max).transform((v) => v || null);
const date = z.string().transform((v, ctx) => {
  const parsed = parseCivilDate(v);
  if (parsed) return parsed;
  ctx.addIssue({ code: "custom", message: "Informe uma data válida entre 2000 e 2100." }); return z.NEVER;
});
const active = z.enum(["true","false"]).transform((v) => v === "true");
export const coverageSchema = z.object({ ...configurationMeta, patientId: text(64), contractId: z.uuid(),
  beneficiaryName: z.string().transform(normalizeName).pipe(text(120)), cardNumber: text(60), planName: optional(120),
  startsOn: date, endsOn: z.union([z.literal("").transform(() => null), date]), active,
}).refine((v) => !v.endsOn || v.endsOn >= v.startsOn, { path: ["endsOn"], message: "Fim anterior ao início." });
export const authorizationSchema = z.object({ ...configurationMeta, coverageId: z.uuid(), contractId: z.uuid(),
  number: text(60), accessCode: optional(60), issuedOn: date, startsOn: date, endsOn: date, active,
}).refine((v) => v.endsOn >= v.startsOn, { path: ["endsOn"], message: "Fim anterior ao início." });
export const authorizationItemSchema = z.object({ ...configurationMeta, authorizationId: z.uuid(), contractId: z.uuid(),
  procedureId: z.uuid(), authorizedQuantity: z.coerce.number().int("Informe quantidade inteira.").min(1).max(2147483647), active,
});
export const authorizationRuleSchema = z.object({ ...configurationMeta, procedureId: z.uuid(),
  mode: z.enum(["PENDENTE","EXIGIDA","DISPENSADA"]), reference: text(300),
});
export const consumptionSchema = z.object({ requestId: z.uuid(), sourceKey: text(100), itemId: z.uuid(),
  quantity: z.number().int().min(1).max(2147483647), executionOn: date, reason: text(300),
});
export type BeneficiaryInput = { kind: "coverage"; values: z.output<typeof coverageSchema> }
  | { kind: "authorization"; values: z.output<typeof authorizationSchema> }
  | { kind: "item"; values: z.output<typeof authorizationItemSchema> };
