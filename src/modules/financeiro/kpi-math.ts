// Calendário e variação dos indicadores financeiros da página inicial. Puro: sem servidor, sem
// fuso local. Datas civis são strings "YYYY-MM-DD" e meses "YYYY-MM", como no restante do módulo.

function isoDate(utcMs: number) {
  return new Date(utcMs).toISOString().slice(0, 10);
}

function parts(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return { year, monthNumber };
}

// "2026-11-08" → "2026-11".
export function monthOf(today: string) {
  return today.slice(0, 7);
}

// Janela meio-aberta do mês: [start, next). Evita calcular o último dia em SQL.
export function monthWindow(month: string): { start: string; next: string } {
  const { year, monthNumber } = parts(month);
  return { start: isoDate(Date.UTC(year, monthNumber - 1, 1)), next: isoDate(Date.UTC(year, monthNumber, 1)) };
}

// "2026-01" → "2025-12".
export function previousMonth(month: string) {
  const { year, monthNumber } = parts(month);
  return isoDate(Date.UTC(year, monthNumber - 2, 1)).slice(0, 7);
}

// "2028-02" → "2028-02-29" (dia zero do mês seguinte).
export function lastDayOf(month: string) {
  const { year, monthNumber } = parts(month);
  return isoDate(Date.UTC(year, monthNumber, 0));
}

// Variação em pontos-base inteiros (1% = 100), calculada em bigint para não perder exatidão com
// somas acima de 2^53. Só o resultado final, já limitado a ±999%, vira Number (não é dinheiro).
export type Delta = { kind: "none" } | { kind: "new" } | { kind: "pct"; basisPoints: number };

export const DELTA_CAP_BASIS_POINTS = 99_900;

export function percentDelta(current: bigint, previous: bigint): Delta {
  const zero = BigInt(0);
  if (previous === zero) return current === zero ? { kind: "none" } : { kind: "new" };
  // Divisão inteira de bigint trunca em direção a zero: 1/3 → 0 bp, -1/3 → 0 bp.
  const raw = ((current - previous) * BigInt(10_000)) / previous;
  const cap = BigInt(DELTA_CAP_BASIS_POINTS);
  const capped = raw > cap ? cap : raw < -cap ? -cap : raw;
  return { kind: "pct", basisPoints: Number(capped) };
}

const PERCENT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export const DELTA_MESSAGES = {
  none: "Sem comparação com o mês anterior",
  new: "Sem movimento no mês anterior",
} as const;

// "+12,5% vs. mês anterior"; teto exibido como "+999%" / "-999%".
export function formatDelta(delta: Delta) {
  if (delta.kind !== "pct") return DELTA_MESSAGES[delta.kind];
  const sign = delta.basisPoints > 0 ? "+" : delta.basisPoints < 0 ? "-" : "";
  return `${sign}${PERCENT.format(Math.abs(delta.basisPoints) / 100)}% vs. mês anterior`;
}

const MONTH_LABEL = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

// "2026-11" → "novembro de 2026".
export function formatMonthLabel(month: string) {
  return MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`));
}
