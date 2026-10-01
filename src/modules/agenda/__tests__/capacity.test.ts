import { occupancyIn, peakOccupancy } from "../capacity";
import { settingsSchema } from "@/modules/configuracoes/validation";
const slot = (start: number, end: number) => ({ startsAt: new Date(start), endsAt: new Date(end) });
it("calcula o pico, sem somar adjacentes ou sobreposições em momentos distintos", () => {
  expect(peakOccupancy([slot(9, 10), slot(10, 11), slot(9, 11)])).toBe(2);
  expect(peakOccupancy([slot(9, 12), slot(10, 11), slot(10, 11)])).toBe(3);
  expect(peakOccupancy([])).toBe(0);
});
it("ignora excesso fora do intervalo candidato", () => {
  expect(occupancyIn(slot(10, 11), [slot(9, 10), slot(9, 10), slot(9, 10), slot(9, 12)])).toBe(1);
});
it.each(["", "0", "-1", "1.5", "abc", "2147483648"])("configuração recusa %s", limit => {
  expect(settingsSchema.safeParse({ agendaDayStartHour: "7", agendaDayEndHour: "20", expectedVersion: "0",
    maxSimultaneousAppointments: limit }).success).toBe(false);
});
it.each(["1", "2", "3", "2147483647"])("configuração aceita inteiro %s", limit => {
  const result = settingsSchema.parse({ agendaDayStartHour: "7", agendaDayEndHour: "20", expectedVersion: "0",
    maxSimultaneousAppointments: limit });
  expect(result.maxSimultaneousAppointments).toBe(Number(limit));
});
