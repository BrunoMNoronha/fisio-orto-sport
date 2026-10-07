import { DUE_DATE_MIN_YEAR, DUE_DATE_MAX_YEAR, isPlausibleId, toDateInput } from "./validation";

export const REPORT_PAGE_SIZE = 20;
const FILTER_KEYS = ["patientId", "start", "end", "page"] as const;

export const REPORT_MESSAGES = {
  invalid: "Filtros inválidos. Revise os parâmetros do relatório.",
  repeated: "Informe cada filtro apenas uma vez.",
  patientInvalid: "Selecione um paciente válido. Não use CPF no filtro.",
  patientNotFound: "Paciente não encontrado. Revise o filtro do relatório.",
  dateInvalid: "Informe datas válidas no formato ano-mês-dia, entre 2000 e 2100.",
  periodInvalid: "A data inicial não pode ser posterior à data final.",
} as const;

// Strings civis canônicas conservam exatamente o período mostrado e os parâmetros da paginação.
export type ReportFilters = { patientId?: string; start?: string; end?: string; page: number };
export type ReportFilterParse =
  | { error: null; filters: ReportFilters }
  | { error: string; filters: null };

function optionalDate(value: string | undefined): boolean {
  if (value === undefined) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && toDateInput(date) === value
    && date.getUTCFullYear() >= DUE_DATE_MIN_YEAR && date.getUTCFullYear() <= DUE_DATE_MAX_YEAR;
}

// Não usa catch que apague um filtro inválido: essa perda ampliaria o relatório silenciosamente.
export function parseReportFilters(raw: unknown): ReportFilterParse {
  const fail = (error: string): ReportFilterParse => ({ error, filters: null });
  const values: Partial<Record<(typeof FILTER_KEYS)[number], string>> = {};
  let entries: [string, unknown][];
  if (raw === undefined) entries = [];
  else if (raw instanceof URLSearchParams) {
    if (Array.from(raw.keys()).some((key) => raw.getAll(key).length !== 1)) return fail(REPORT_MESSAGES.repeated);
    entries = Array.from(raw.entries());
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)
    && (Object.getPrototypeOf(raw) === Object.prototype || Object.getPrototypeOf(raw) === null)) {
    entries = Object.entries(raw);
  } else return fail(REPORT_MESSAGES.invalid);

  for (const [key, value] of entries) {
    if (!FILTER_KEYS.includes(key as (typeof FILTER_KEYS)[number])) return fail(REPORT_MESSAGES.invalid);
    if (Array.isArray(value)) return fail(REPORT_MESSAGES.repeated);
    if (value === undefined) continue;
    if (typeof value !== "string") {
      // Página é só navegação e pode ser normalizada; paciente/período precisam ser recusados.
      if (key === "page") continue;
      return fail(key === "patientId" ? REPORT_MESSAGES.patientInvalid : REPORT_MESSAGES.dateInvalid);
    }
    const text = value.trim();
    if (text) values[key as (typeof FILTER_KEYS)[number]] = text;
  }

  const { patientId, start, end } = values;
  if (patientId && (!isPlausibleId(patientId) || /^\d+$/.test(patientId))) return fail(REPORT_MESSAGES.patientInvalid);
  if (!optionalDate(start) || !optionalDate(end)) return fail(REPORT_MESSAGES.dateInvalid);
  if (start && end && start > end) return fail(REPORT_MESSAGES.periodInvalid);
  const requested = values.page && /^\d+$/.test(values.page) ? Number(values.page) : 1;
  const page = Number.isSafeInteger(requested) && requested >= 1 && requested <= 10_000 ? requested : 1;
  return { error: null, filters: { ...(patientId ? { patientId } : {}), ...(start ? { start } : {}), ...(end ? { end } : {}), page } };
}
