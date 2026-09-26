import {
  SESSION_LIMITS,
  createSessionSchema,
  formatOccurredAt,
  invalidateSessionSchema,
  sessionPageSchema,
  updateSessionSchema,
} from "../session-validation";

const base = {
  planId: "pl1",
  planRevisionId: "r1",
  requestId: "0b3f1c2e-1111-4a2b-9c3d-123456789abc",
  occurredDate: "2026-09-20",
  occurredTime: "14:30",
  professionalId: "f1",
  evolution: "Melhora da ADM",
};

function errorsOf(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((issue) => issue.path.join(".")) ?? [];
}

describe("createSessionSchema", () => {
  it("combina data e hora no fuso da clínica e normaliza opcionais vazios", () => {
    const result = createSessionSchema.parse({ ...base, techniques: " ", nextSteps: "" });
    expect(result.occurredAt).toEqual(new Date("2026-09-20T17:30:00.000Z")); // 14:30 em São Paulo (UTC−3)
    expect(result).toMatchObject({ techniques: null, nextSteps: null, evolution: "Melhora da ADM" });
    expect(result).not.toHaveProperty("occurredDate");
  });

  it("obrigatórios: plano, revisão, chave, data, hora, profissional e evolução", () => {
    expect(errorsOf(createSessionSchema.safeParse({})).sort()).toEqual(
      ["evolution", "occurredDate", "occurredTime", "planId", "planRevisionId", "professionalId", "requestId"].sort(),
    );
  });

  it("recusa atendimento no futuro (instante no fuso da clínica)", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-26T15:00:00Z")); // 12:00 em São Paulo
    try {
      expect(createSessionSchema.safeParse({ ...base, occurredDate: "2026-09-26", occurredTime: "11:59" }).success).toBe(true);
      expect(errorsOf(createSessionSchema.safeParse({ ...base, occurredDate: "2026-09-26", occurredTime: "12:01" }))).toEqual([
        "occurredDate",
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("data e hora inválidas", () => {
    expect(errorsOf(createSessionSchema.safeParse({ ...base, occurredDate: "2026-02-30" }))).toEqual(["occurredDate"]);
    expect(errorsOf(createSessionSchema.safeParse({ ...base, occurredDate: "1899-12-31" }))).toEqual(["occurredDate"]);
    expect(errorsOf(createSessionSchema.safeParse({ ...base, occurredTime: "25:00" }))).toEqual(["occurredTime"]);
  });

  it("limites e chave de idempotência", () => {
    const long = createSessionSchema.safeParse({ ...base, evolution: "x".repeat(SESSION_LIMITS.evolution + 1) });
    expect(errorsOf(long)).toEqual(["evolution"]);
    expect(errorsOf(createSessionSchema.safeParse({ ...base, requestId: "curta" }))).toEqual(["requestId"]);
    expect(errorsOf(createSessionSchema.safeParse({ ...base, requestId: "x'; drop" }))).toEqual(["requestId"]);
  });
});

describe("updateSessionSchema e invalidateSessionSchema", () => {
  it("correção exige versão e motivo; invalidação exige motivo", () => {
    const fields = {
      occurredDate: base.occurredDate,
      occurredTime: base.occurredTime,
      professionalId: base.professionalId,
      evolution: base.evolution,
    };
    expect(updateSessionSchema.parse({ ...fields, version: "2", reason: "Hora errada" })).toMatchObject({ version: 2 });
    expect(errorsOf(updateSessionSchema.safeParse({ ...fields, version: "0", reason: " " })).sort()).toEqual([
      "reason",
      "version",
    ]);
    expect(invalidateSessionSchema.safeParse({ reason: "" }).success).toBe(false);
  });
});

describe("formatOccurredAt e página", () => {
  it("mostra o momento no fuso da clínica", () => {
    expect(formatOccurredAt(new Date("2026-09-20T17:30:00.000Z"))).toBe("20/09/2026 14:30");
  });

  it("página inválida cai na primeira", () => {
    expect(sessionPageSchema.parse("abc")).toBe(1);
  });
});
