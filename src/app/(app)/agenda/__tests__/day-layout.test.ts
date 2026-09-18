import { toInstant } from "@/modules/agenda/validation";
import { HOUR_HEIGHT_PX, assignLanes, dayHourRange, groupByProfessional, placeOnGrid } from "../day-layout";

const slot = (start: string, end: string, professional = { id: "f1", name: "Ana" }) => ({
  startsAt: toInstant("2026-09-21", start),
  endsAt: toInstant("2026-09-21", end),
  professional,
});

describe("dayHourRange", () => {
  it("usa 07–20 por padrão", () => {
    expect(dayHourRange([])).toEqual({ startHour: 7, endHour: 20 });
  });

  it("amplia para agendamentos fora da faixa", () => {
    expect(dayHourRange([slot("06:30", "07:30"), slot("20:00", "21:15")])).toEqual({ startHour: 6, endHour: 22 });
  });
});

describe("placeOnGrid", () => {
  it("posiciona pelo horário da clínica", () => {
    expect(placeOnGrid(slot("08:30", "09:30"), 7)).toEqual({ top: 1.5 * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX });
  });

  it("altura mínima de 15 minutos", () => {
    expect(placeOnGrid(slot("08:00", "08:05"), 8).height).toBe(HOUR_HEIGHT_PX / 4);
  });
});

describe("assignLanes", () => {
  it("itens sem sobreposição ficam na mesma faixa", () => {
    const { lanes, placed } = assignLanes([slot("09:00", "10:00"), slot("10:00", "11:00")]);
    expect(lanes).toBe(1);
    expect(placed.map((p) => p.lane)).toEqual([0, 0]);
  });

  it("sobrepostos vão para faixas diferentes", () => {
    const { lanes, placed } = assignLanes([slot("09:00", "10:00"), slot("09:30", "10:30")]);
    expect(lanes).toBe(2);
    expect(placed.map((p) => p.lane)).toEqual([0, 1]);
  });
});

describe("groupByProfessional", () => {
  it("mantém colunas vazias e acrescenta profissionais fora da lista", () => {
    const other = { id: "f9", name: "Zé" };
    const columns = groupByProfessional(
      [slot("09:00", "10:00"), slot("09:00", "10:00", other)],
      [
        { id: "f1", name: "Ana" },
        { id: "f2", name: "Bia" },
      ],
    );
    expect(columns.map((c) => [c.professional.id, c.items.length])).toEqual([
      ["f1", 1],
      ["f2", 0],
      ["f9", 1],
    ]);
  });
});
