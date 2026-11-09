import {
  DELTA_CAP_BASIS_POINTS,
  DELTA_MESSAGES,
  formatDelta,
  formatMonthLabel,
  lastDayOf,
  monthOf,
  monthWindow,
  percentDelta,
  previousMonth,
} from "../kpi-math";

describe("calendário dos indicadores", () => {
  it("extrai o mês da data civil", () => {
    expect(monthOf("2026-11-08")).toBe("2026-11");
  });

  it("janela meio-aberta do mês, inclusive na virada do ano", () => {
    expect(monthWindow("2026-11")).toEqual({ start: "2026-11-01", next: "2026-12-01" });
    expect(monthWindow("2026-12")).toEqual({ start: "2026-12-01", next: "2027-01-01" });
  });

  it("mês anterior atravessa janeiro", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-03")).toBe("2026-02");
  });

  it("último dia respeita fevereiro bissexto e meses de 31", () => {
    expect(lastDayOf("2028-02")).toBe("2028-02-29");
    expect(lastDayOf("2027-02")).toBe("2027-02-28");
    expect(lastDayOf("2026-12")).toBe("2026-12-31");
  });

  it("rótulo do mês em pt-BR", () => {
    expect(formatMonthLabel("2026-11")).toBe("novembro de 2026");
  });
});

describe("variação em relação ao mês anterior", () => {
  const big = BigInt;

  it("sem movimento nos dois meses não compara", () => {
    expect(percentDelta(big(0), big(0))).toEqual({ kind: "none" });
    expect(formatDelta({ kind: "none" })).toBe(DELTA_MESSAGES.none);
  });

  it("mês anterior zerado não divide por zero", () => {
    expect(percentDelta(big(500), big(0))).toEqual({ kind: "new" });
    expect(formatDelta({ kind: "new" })).toBe(DELTA_MESSAGES.new);
  });

  it("calcula em pontos-base inteiros, truncando em direção a zero", () => {
    expect(percentDelta(big(150), big(100))).toEqual({ kind: "pct", basisPoints: 5000 });
    expect(percentDelta(big(50), big(100))).toEqual({ kind: "pct", basisPoints: -5000 });
    expect(percentDelta(big(101), big(100))).toEqual({ kind: "pct", basisPoints: 100 });
    expect(percentDelta(big(100), big(300))).toEqual({ kind: "pct", basisPoints: -6666 });
  });

  it("não perde exatidão acima de 2^53", () => {
    const previous = big(2) ** big(59);
    expect(percentDelta(previous * big(2), previous)).toEqual({ kind: "pct", basisPoints: 10000 });
  });

  it("limita a exibição a ±999%", () => {
    expect(percentDelta(big(100), big(3))).toEqual({ kind: "pct", basisPoints: DELTA_CAP_BASIS_POINTS });
    expect(percentDelta(big(-100_000), big(3))).toEqual({ kind: "pct", basisPoints: -DELTA_CAP_BASIS_POINTS });
    expect(formatDelta({ kind: "pct", basisPoints: DELTA_CAP_BASIS_POINTS })).toBe("+999% vs. mês anterior");
  });

  it("formata em pt-BR com sinal e uma casa decimal", () => {
    expect(formatDelta({ kind: "pct", basisPoints: 1250 })).toBe("+12,5% vs. mês anterior");
    expect(formatDelta({ kind: "pct", basisPoints: -6666 })).toBe("-66,7% vs. mês anterior");
    expect(formatDelta({ kind: "pct", basisPoints: 0 })).toBe("0% vs. mês anterior");
  });
});
