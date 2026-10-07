/** @jest-environment node */
import { parseReportFilters, REPORT_MESSAGES } from "../report-validation";

describe("filtros FIN-03", () => {
  it("aceita filtros opcionais, período inclusivo e paciente inativo por ID", () => {
    expect(parseReportFilters(undefined)).toEqual({ error: null, filters: { page: 1 } });
    expect(parseReportFilters({ patientId: "clpatient1", start: "2026-10-01", end: "2026-10-01", page: "2" })).toEqual({
      error: null, filters: { patientId: "clpatient1", start: "2026-10-01", end: "2026-10-01", page: 2 },
    });
    expect(parseReportFilters({ start: "2000-01-01", end: "2100-12-31" }).error).toBeNull();
    expect(parseReportFilters({ start: "", end: " ", patientId: "" })).toEqual({ error: null, filters: { page: 1 } });
    expect(parseReportFilters(new URLSearchParams("patientId=p1&start=2024-02-29&end=2024-02-29&page=3"))).toEqual({
      error: null, filters: { patientId: "p1", start: "2024-02-29", end: "2024-02-29", page: 3 },
    });
  });

  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "2026-1-02", "07/10/2026", "1999-12-31", "2101-01-01", "2026-10-07T00:00:00Z"])(
    "recusa data inexistente ou fora da faixa %s", (date) => {
      for (const field of ["start", "end"]) {
        expect(parseReportFilters({ [field]: date })).toEqual({ error: REPORT_MESSAGES.dateInvalid, filters: null });
      }
    },
  );

  it("período invertido é erro explícito e conserva a recusa de leitura", () => {
    expect(parseReportFilters({ start: "2026-10-08", end: "2026-10-07" })).toEqual({ error: REPORT_MESSAGES.periodInvalid, filters: null });
  });

  it.each(["12345678901", "123.456.789-01", "123", "paciente com espaço", "x".repeat(65)])("recusa CPF/ID inválido %s", (patientId) => {
    expect(parseReportFilters({ patientId })).toEqual({ error: REPORT_MESSAGES.patientInvalid, filters: null });
  });

  it.each(["patientId", "start", "end", "page"])("recusa parâmetros repetidos de %s", (field) => {
    expect(parseReportFilters({ [field]: ["1", "2"] })).toEqual({ error: REPORT_MESSAGES.repeated, filters: null });
    expect(parseReportFilters(new URLSearchParams(`${field}=1&${field}=2`))).toEqual({ error: REPORT_MESSAGES.repeated, filters: null });
  });

  it.each([null, [], true, "start=2026-10-07", new Date(), { cpf: "12345678901" }, { q: "ANA" }, { fullName: "ANA" }])(
    "estrutura ou filtro não admitido não amplia consulta", (raw) => {
      expect(parseReportFilters(raw)).toEqual({ error: REPORT_MESSAGES.invalid, filters: null });
    },
  );

  it.each([{ start: 20261007 }, { end: null }, { patientId: 123 }, { start: {} }])("valor tipado indevidamente é recusado", (raw) => {
    expect(parseReportFilters(raw).filters).toBeNull();
    expect(parseReportFilters(raw).error).not.toBeNull();
  });

  it.each(["0", "-1", "2.5", "NaN", "Infinity", "10001", "999999999999999999", "", 2, null, {}])("normaliza só página inválida %s", (page) => {
    expect(parseReportFilters({ start: "2026-10-07", page })).toEqual({ error: null, filters: { start: "2026-10-07", page: 1 } });
  });
});
