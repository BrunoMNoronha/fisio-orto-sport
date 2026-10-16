import { addDays, toInstant, toLocalTime } from "../validation";
import { recurrenceDates, recurrenceSchema, weekday } from "../recurrence";

describe("recorrência por dias da semana", () => {
  it("inclui a primeira entre as cinco sessões do exemplo", () => {
    expect(recurrenceDates({ date: "2026-10-19", sessionCount: 5, weekdays: [1, 3, 5] }))
      .toEqual(["2026-10-19", "2026-10-21", "2026-10-23", "2026-10-26", "2026-10-28"]);
  });
  it("uma sessão gera apenas a data inicial", () => {
    expect(recurrenceDates({ date: "2026-10-19", sessionCount: 1, weekdays: [1] })).toEqual(["2026-10-19"]);
  });
  it("ordena dias, elimina repetições e respeita a virada de ano", () => {
    expect(recurrenceDates({ date: "2026-12-30", sessionCount: 4, weekdays: [5, 1, 3, 1] }))
      .toEqual(["2026-12-30", "2027-01-01", "2027-01-04", "2027-01-06"]);
  });
  it("inclui fevereiro bissexto e mantém hora local", () => {
    const dates = recurrenceDates({ date: "2028-02-28", sessionCount: 3, weekdays: [1, 2, 3, 4, 5, 6, 7] });
    expect(dates).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
    expect(dates.map((date) => toLocalTime(toInstant(date, "14:00")))).toEqual(["14:00", "14:00", "14:00"]);
  });
  it("um único dia semanal e fins de semana", () => {
    expect(recurrenceDates({ date: "2026-10-24", sessionCount: 3, weekdays: [6, 7] })).toEqual(["2026-10-24", "2026-10-25", "2026-10-31"]);
    expect(recurrenceDates({ date: "2026-10-19", sessionCount: 3, weekdays: [1] })).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
  });
  it.each(["", 0, -1, 1.5, "a", Infinity, 101, null])("recusa quantidade inválida %s", (sessionCount) => {
    expect(recurrenceSchema.safeParse({ date: "2026-10-19", sessionCount, weekdays: [1] }).success).toBe(false);
  });
  it.each([[], [2], [0], [8]])("recusa seleção sem o dia inicial ou inválida %s", (...weekdays) => {
    expect(recurrenceSchema.safeParse({ date: "2026-10-19", sessionCount: 5, weekdays }).success).toBe(false);
  });
  it("recusa data inválida e evita geração ilimitada", () => {
    expect(() => recurrenceDates({ date: "2026-02-30", sessionCount: 5, weekdays: [1] })).toThrow();
    expect(() => recurrenceDates({ date: "2026-10-19", sessionCount: 5, weekdays: [] })).toThrow();
    const dates = recurrenceDates({ date: "2026-10-19", sessionCount: 100, weekdays: [1, 2, 3, 4, 5, 6, 7] });
    expect(dates).toHaveLength(100);
    expect(dates[99]).toBe(addDays("2026-10-19", 99));
    expect(weekday(dates[0])).toBe(1);
  });
});
