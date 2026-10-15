import { z } from "zod";
import { parseCivilDate } from "./catalog-validation";
export const REPORT_KINDS = ["producao", "pendencias", "autorizacoes"] as const;
export type AdministrativeReportKind = typeof REPORT_KINDS[number];
export const REPORT_TITLES = { producao: "Produção por execução", pendencias: "Pendências da produção", autorizacoes: "Autorizações e saldos" };
export const PRODUCTION_STATES = ["PENDENTE", "APTO", "INVALIDADO", "FECHADO", "ENVIADO"] as const;
export const AUTHORIZATION_STATES = ["AUTORIZADA", "FUTURA", "VENCIDA", "ESGOTADA", "INATIVA"] as const;
const id = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
const civil = z.string().refine(v => !!parseCivilDate(v), "Informe uma data válida entre 2000 e 2100.");
const schema = z.object({ patientId: id.optional(), operatorId: z.uuid().optional(), contractId: z.uuid().optional(), procedureId: z.uuid().optional(), professionalId: id.optional(), authorizationId: z.uuid().optional(), start: civil.optional(), end: civil.optional(), state: z.string().optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export type AdministrativeReportFilters = z.output<typeof schema>;
export function parseAdministrativeReportFilters(kind: unknown, raw: unknown) {
  const fail = (error: string) => ({ error, filters: null });
  if (!REPORT_KINDS.includes(kind as AdministrativeReportKind)) return fail("Relatório inválido.");
  let entries: [string, unknown][];
  if (raw instanceof URLSearchParams) { if ([...raw.keys()].some(k => raw.getAll(k).length !== 1)) return fail("Informe cada filtro apenas uma vez."); entries = [...raw.entries()]; }
  else if (raw === undefined) entries = [];
  else if (raw && typeof raw === 'object' && !Array.isArray(raw) && (Object.getPrototypeOf(raw) === Object.prototype || Object.getPrototypeOf(raw) === null)) entries = Object.entries(raw);
  else return fail("Filtros inválidos.");
  const values: Record<string, unknown> = {};
  for (const [key, value] of entries) { if (value === undefined) continue; if (typeof value !== 'string') return fail("Informe cada filtro uma vez, como texto."); values[key] = value.trim() || undefined; }
  const parsed = schema.safeParse(values); if (!parsed.success) return fail("Filtros inválidos. Revise datas, identificadores, estado e página.");
  const f = parsed.data;
  if (f.start && f.end && f.start > f.end) return fail("A data inicial não pode ser posterior à final.");
  if (f.patientId && /^\d+$/.test(f.patientId)) return fail("Selecione o paciente pelo nome; não informe CPF.");
  if (kind === 'autorizacoes' && f.professionalId) return fail("O saldo autorizado não pertence a um profissional. Remova esse filtro.");
  if (kind !== 'autorizacoes' && f.authorizationId) return fail("O filtro de autorização pertence ao relatório de saldos.");
  const states: readonly string[] = kind === 'autorizacoes' ? AUTHORIZATION_STATES : PRODUCTION_STATES;
  if (f.state && !states.includes(f.state)) return fail("Estado inválido para este relatório.");
  return { error: null, filters: f };
}
export function administrativeReportQuery(filters: AdministrativeReportFilters, page?: number) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) { if (key !== 'page' && value !== undefined) q.set(key, String(value)); }
  if (page && page > 1) q.set('page', String(page)); return q.toString();
}
export function reportPeriod(kind: AdministrativeReportKind) { return kind === 'autorizacoes' ? 'Vigência da autorização que intersecta o período; saldo atual de todos os movimentos, sem posição histórica de corte.' : 'Data civil de execução (America/Sao_Paulo). Produção conferida não é receita recebida.'; }
