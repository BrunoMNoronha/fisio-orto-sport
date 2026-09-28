/** @jest-environment node */
import {
  CLOSED_WEEK,
  describeWeek,
  endOptions,
  formatBusinessHours,
  isClosedWeek,
  isWithinBusinessHours,
  parseBusinessHours,
  startOptions,
  weekdayOf,
} from "../business-hours";
import { toInstant } from "../validation";

// Seg–Sex 08:00–12:00 e 13:00–18:00; Sáb 08:00–12:00; Dom fechado.
const TEXT = ";08:00-12:00,13:00-18:00;08:00-12:00,13:00-18:00;08:00-12:00,13:00-18:00;08:00-12:00,13:00-18:00;08:00-12:00,13:00-18:00;08:00-12:00";
const week = parseBusinessHours(TEXT)!;
const MONDAY = "2026-09-21";
const SATURDAY = "2026-09-26";
const SUNDAY = "2026-09-27";
const at = (date: string, start: string, end: string) => [toInstant(date, start), toInstant(date, end)] as const;

describe("formato persistido", () => {
  it("lê e regrava o texto canônico", () => {
    expect(formatBusinessHours(week)).toBe(TEXT);
    expect(parseBusinessHours(CLOSED_WEEK)).toEqual([[], [], [], [], [], [], []]);
    expect(isClosedWeek(parseBusinessHours(CLOSED_WEEK)!)).toBe(true);
    expect(isClosedWeek(week)).toBe(false);
  });

  it.each([
    ["menos de 7 dias", ";;;;;"],
    ["fim antes do início", ";12:00-08:00;;;;;"],
    ["intervalos sobrepostos", ";08:00-12:00,11:00-13:00;;;;;"],
    ["mais de dois intervalos", ";08:00-09:00,10:00-11:00,12:00-13:00;;;;;"],
    ["horário inválido", ";8:00-12:00;;;;;"],
    ["lixo", ";08:00-12:00-13:00;;;;;"],
  ])("recusa: %s", (_label, text) => {
    expect(parseBusinessHours(text)).toBeNull();
  });
});

describe("isWithinBusinessHours (fuso America/Sao_Paulo)", () => {
  it.each([
    ["início e fim nos limites", MONDAY, "08:00", "12:00", true],
    ["no segundo intervalo", MONDAY, "13:00", "18:00", true],
    ["antes da abertura", MONDAY, "07:30", "08:30", false],
    ["ultrapassa o fechamento", MONDAY, "17:30", "18:30", false],
    ["atravessa a pausa", MONDAY, "11:30", "13:30", false],
    ["começa na pausa", MONDAY, "12:00", "12:50", false],
    ["sábado de manhã", SATURDAY, "09:00", "10:00", true],
    ["sábado à tarde (fechado)", SATURDAY, "14:00", "15:00", false],
    ["domingo (fechado)", SUNDAY, "09:00", "10:00", false],
  ])("%s", (_label, date, start, end, expected) => {
    const [startsAt, endsAt] = at(date, start, end);
    expect(isWithinBusinessHours(week, startsAt, endsAt)).toBe(expected);
  });

  it("usa a data e a hora locais, não UTC (21:00 local já é outro dia em UTC)", () => {
    const late = parseBusinessHours(";20:00-23:00;;;;;")!;
    const [startsAt, endsAt] = at(MONDAY, "21:00", "22:00");
    expect(startsAt.toISOString()).toBe("2026-09-22T00:00:00.000Z");
    expect(isWithinBusinessHours(late, startsAt, endsAt)).toBe(true);
  });

  it("fim à meia-noite conta como 24:00 do mesmo dia", () => {
    const night = parseBusinessHours(";22:00-24:00;;;;;")!;
    expect(isWithinBusinessHours(night, toInstant(MONDAY, "23:00"), toInstant("2026-09-22", "00:00"))).toBe(true);
    expect(isWithinBusinessHours(night, toInstant(MONDAY, "23:00"), toInstant("2026-09-22", "00:30"))).toBe(false);
  });
});

describe("opções do formulário", () => {
  it("inícios no passo de 5 min, só dentro dos intervalos; dia fechado não tem opção", () => {
    const starts = startOptions(week, MONDAY);
    expect(starts[0]).toBe("08:00");
    expect(starts).toContain("11:55");
    expect(starts).not.toContain("12:00");
    expect(starts).not.toContain("12:30");
    expect(starts).toContain("13:00");
    expect(starts.at(-1)).toBe("17:55");
    expect(startOptions(week, SUNDAY)).toEqual([]);
  });

  it("fins vão do início + 5 min até o fechamento do mesmo intervalo", () => {
    const ends = endOptions(week, MONDAY, "11:00");
    expect(ends[0]).toBe("11:05");
    expect(ends.at(-1)).toBe("12:00");
    expect(endOptions(week, MONDAY, "12:30")).toEqual([]);
    expect(endOptions(week, MONDAY, "")).toEqual([]);
  });

  it("resumo agrupa dias iguais", () => {
    expect(weekdayOf(MONDAY)).toBe(1);
    expect(describeWeek(week)).toBe("Seg–Sex 08:00–12:00, 13:00–18:00 · Sáb 08:00–12:00");
    expect(describeWeek(parseBusinessHours(CLOSED_WEEK)!)).toBe("Nenhum dia com expediente.");
  });
});
