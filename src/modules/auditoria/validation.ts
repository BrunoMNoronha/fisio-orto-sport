// Filtros da consulta de auditoria (issue #56, T4): usuário, ação e período, pela URL.
import { z } from "zod";
import { isValidDate } from "@/modules/agenda/validation";
import { AUDIT_ACTIONS } from "./events";

export const AUDIT_PAGE_SIZE = 50;

const optionalDate = z
  .string()
  .trim()
  .optional()
  .catch(undefined)
  .transform((value) => (value && isValidDate(value) ? value : undefined));

export const auditFiltersSchema = z.object({
  // Id de usuário (cuid): quem agiu ou quem foi alvo.
  userId: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z0-9]+$/i)
    .optional()
    .catch(undefined)
    .transform((value) => value || undefined),
  action: z.enum(AUDIT_ACTIONS as [string, ...string[]]).optional().catch(undefined),
  // Datas civis (YYYY-MM-DD) no fuso da clínica, inclusivas.
  from: optionalDate,
  to: optionalDate,
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type AuditFilters = z.infer<typeof auditFiltersSchema>;
