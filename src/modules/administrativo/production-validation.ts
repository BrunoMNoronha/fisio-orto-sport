import { z } from "zod";
import { configurationMeta } from "./validation";
export const productionSchema = z.object({
  ...configurationMeta, sessionId: z.string().min(1).max(64), coverageId: z.uuid(), procedureId: z.uuid(),
  quantity: z.coerce.number().int().min(1).max(2147483647),
  endTime: z.string().regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/, "Informe HH:mm ou deixe vazio.").transform(v => v || null),
  authorizationItemId: z.union([z.literal(""), z.uuid()]).transform(v => v || undefined),
  operation: z.enum(["PREPARAR", "CONFERIR", "DEVOLVER", "INVALIDAR"]),
});
export type ProductionInput = z.output<typeof productionSchema>;
export const PRODUCTION_LABELS: Record<string, string> = { PENDENTE: "Pendente", APTO: "Apto", INVALIDADO: "Invalidado", FECHADO: "Fechado", ENVIADO: "Enviado" };
