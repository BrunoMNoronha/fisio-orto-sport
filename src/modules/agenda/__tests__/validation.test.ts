import {
  addDays,
  appointmentSchema,
  cancelSchema,
  filterBounds,
  isValidTime,
  overlaps,
  parseAgendaFilter,
  parseAgendaView,
  rescheduleSchema,
  startOfWeek,
  startsInPast,
  toInstant,
  toLocalDate,
  toLocalTime,
} from "../validation";

const valid = {
  patientId: "p1",
  professionalId: "f1",
  date: "2026-09-21",
  startTime: "09:00",
  endTime: "10:00",
};

function errorsOf(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((issue) => issue.path.join(".")) ?? [];
}

describe("fuso da clínica", () => {
  it("interpreta data e hora em America/Sao_Paulo", () => {
    expect(toInstant("2026-09-21", "10:00").toISOString()).toBe("2026-09-21T13:00:00.000Z");
  });

  it("converte de volta para data e hora locais", () => {
    const instant = new Date("2026-09-22T02:30:00.000Z");
    expect(toLocalDate(instant)).toBe("2026-09-21");
    expect(toLocalTime(instant)).toBe("23:30");
  });

  it("soma dias em datas civis", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("appointmentSchema", () => {
  it("aceita um agendamento válido e gera início e fim", () => {
    const result = appointmentSchema.safeParse({ ...valid, notes: "  Trazer exames  " });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      patientId: "p1",
      professionalId: "f1",
      notes: "Trazer exames",
      startsAt: new Date("2026-09-21T12:00:00.000Z"),
      endsAt: new Date("2026-09-21T13:00:00.000Z"),
    });
  });

  it("observação vazia vira null", () => {
    expect(appointmentSchema.parse({ ...valid, notes: "  " }).notes).toBeNull();
  });

  it("recusa campos obrigatórios ausentes", () => {
    const result = appointmentSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(errorsOf(result)).toEqual(
      expect.arrayContaining(["patientId", "professionalId", "date", "startTime", "endTime"]),
    );
  });

  it("recusa fim igual ou anterior ao início", () => {
    expect(errorsOf(appointmentSchema.safeParse({ ...valid, endTime: "09:00" }))).toContain("endTime");
    expect(errorsOf(appointmentSchema.safeParse({ ...valid, endTime: "08:00" }))).toContain("endTime");
  });

  it("recusa duração acima de 12 horas", () => {
    expect(errorsOf(appointmentSchema.safeParse({ ...valid, startTime: "07:00", endTime: "19:30" }))).toContain(
      "endTime",
    );
  });

  it("recusa data e horário inválidos", () => {
    expect(errorsOf(appointmentSchema.safeParse({ ...valid, date: "2026-02-30" }))).toContain("date");
    expect(errorsOf(appointmentSchema.safeParse({ ...valid, startTime: "25:00" }))).toContain("startTime");
  });

  it("recusa campos de data e horário vazios sem lançar exceção", () => {
    const result = appointmentSchema.safeParse({ ...valid, date: "", startTime: "", endTime: "" });
    expect(result.success).toBe(false);
    expect(errorsOf(result)).toEqual(expect.arrayContaining(["date", "startTime", "endTime"]));
  });

  it("recusa observação longa demais", () => {
    expect(errorsOf(appointmentSchema.safeParse({ ...valid, notes: "x".repeat(501) }))).toContain("notes");
  });
});

describe("rescheduleSchema e cancelSchema", () => {
  it("reagendamento exige id e repete as validações de horário", () => {
    const slot = { professionalId: valid.professionalId, date: valid.date, startTime: "09:00", endTime: "10:00" };
    expect(rescheduleSchema.safeParse({ id: "a1", ...slot }).success).toBe(true);
    expect(errorsOf(rescheduleSchema.safeParse(slot))).toContain("id");
    expect(errorsOf(rescheduleSchema.safeParse({ id: "a1", ...slot, endTime: "08:00" }))).toContain("endTime");
  });

  it("cancelamento tem motivo opcional", () => {
    expect(cancelSchema.parse({ id: "a1" })).toEqual({ id: "a1", reason: null });
    expect(cancelSchema.parse({ id: "a1", reason: " Paciente pediu " })).toEqual({ id: "a1", reason: "Paciente pediu" });
  });
});

describe("overlaps", () => {
  const at = (start: string, end: string) => ({
    startsAt: toInstant("2026-09-21", start),
    endsAt: toInstant("2026-09-21", end),
  });

  it("detecta sobreposição parcial e contida", () => {
    expect(overlaps(at("09:00", "10:00"), at("09:30", "10:30"))).toBe(true);
    expect(overlaps(at("09:00", "12:00"), at("10:00", "11:00"))).toBe(true);
  });

  it("horários adjacentes não conflitam", () => {
    expect(overlaps(at("09:00", "10:00"), at("10:00", "11:00"))).toBe(false);
  });
});

describe("parseAgendaFilter", () => {
  const now = new Date("2026-09-18T15:00:00.000Z");

  it("padrão: sete dias a partir de hoje", () => {
    expect(parseAgendaFilter({}, now)).toEqual({ from: "2026-09-18", to: "2026-09-24" });
  });

  it("mantém profissional e período válidos", () => {
    expect(parseAgendaFilter({ professionalId: "f1", from: "2026-09-01", to: "2026-09-10" }, now)).toEqual({
      professionalId: "f1",
      from: "2026-09-01",
      to: "2026-09-10",
    });
  });

  it("corrige período invertido, longo demais e datas inválidas", () => {
    expect(parseAgendaFilter({ from: "2026-09-10", to: "2026-09-01" }, now).to).toBe("2026-09-10");
    expect(parseAgendaFilter({ from: "2026-09-01", to: "2026-12-31" }, now).to).toBe("2026-10-01");
    expect(parseAgendaFilter({ from: "lixo", to: "2026-13-01" }, now)).toEqual({ from: "2026-09-18", to: "2026-09-24" });
  });

  it("limites cobrem dias inteiros no fuso da clínica", () => {
    expect(filterBounds({ from: "2026-09-21", to: "2026-09-21" })).toEqual({
      gte: new Date("2026-09-21T03:00:00.000Z"),
      lt: new Date("2026-09-22T03:00:00.000Z"),
    });
  });
});

describe("parseAgendaView", () => {
  const now = new Date("2026-09-18T15:00:00.000Z"); // sexta-feira

  it("padrão: visão do dia de hoje", () => {
    expect(parseAgendaView({}, now)).toEqual({
      view: "dia",
      date: "2026-09-18",
      today: "2026-09-18",
      filter: { from: "2026-09-18", to: "2026-09-18" },
    });
  });

  it("dia: período é a própria data, com profissional", () => {
    const result = parseAgendaView({ view: "dia", date: "2026-09-21", professionalId: "f1" }, now);
    expect(result.filter).toEqual({ professionalId: "f1", from: "2026-09-21", to: "2026-09-21" });
  });

  it("semana: de segunda a domingo da semana da data", () => {
    expect(parseAgendaView({ view: "semana", date: "2026-09-18" }, now).filter).toEqual({
      from: "2026-09-14",
      to: "2026-09-20",
    });
    expect(parseAgendaView({ view: "semana", date: "2026-09-20" }, now).filter.from).toBe("2026-09-14");
    expect(parseAgendaView({ view: "semana", date: "2026-09-21" }, now).filter.from).toBe("2026-09-21");
  });

  it("lista: usa de/até com as regras do filtro", () => {
    expect(parseAgendaView({ view: "lista", from: "2026-09-01", to: "2026-09-05" }, now).filter).toEqual({
      from: "2026-09-01",
      to: "2026-09-05",
    });
  });

  it("valores inválidos caem no padrão", () => {
    const result = parseAgendaView({ view: "mes", date: "2026-02-30" }, now);
    expect(result.view).toBe("dia");
    expect(result.date).toBe("2026-09-18");
  });
});

describe("startOfWeek e isValidTime", () => {
  it("segunda-feira da semana", () => {
    expect(startOfWeek("2026-09-14")).toBe("2026-09-14");
    expect(startOfWeek("2026-10-01")).toBe("2026-09-28");
  });

  it("valida HH:MM", () => {
    expect(isValidTime("08:00")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("8:00")).toBe(false);
  });
});

describe("startsInPast", () => {
  // 18/09/2026 15:30 em São Paulo (UTC−3).
  const now = new Date("2026-09-18T18:30:00Z");

  it("compara no fuso da clínica", () => {
    expect(startsInPast("2026-09-18", "15:00", now)).toBe(true);
    expect(startsInPast("2026-09-18", "15:30", now)).toBe(false);
    expect(startsInPast("2026-09-18", "16:00", now)).toBe(false);
    expect(startsInPast("2026-09-17", "23:00", now)).toBe(true);
  });

  it("data ou hora incompletas não são passado", () => {
    expect(startsInPast("", "15:00", now)).toBe(false);
    expect(startsInPast("2026-09-18", "", now)).toBe(false);
  });
});
