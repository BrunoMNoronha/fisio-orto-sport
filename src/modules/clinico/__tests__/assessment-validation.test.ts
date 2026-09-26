import {
  ASSESSMENT_LIMITS,
  assessmentPageSchema,
  createAssessmentSchema,
  diffAssessment,
  updateAssessmentSchema,
} from "../assessment-validation";

const base = { assessmentDate: "2026-09-01", anamnesisId: "an1", diagnosis: "Tendinopatia" };

function errorsOf(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((issue) => issue.path.join(".")) ?? [];
}

describe("createAssessmentSchema", () => {
  it("mínimo obrigatório: data, anamnese e diagnóstico; o resto vazio vira null (não informado)", () => {
    const result = createAssessmentSchema.safeParse({ ...base, inspection: "  ", therapeuticGoals: "" });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      diagnosis: "Tendinopatia",
      inspection: null,
      therapeuticGoals: null,
      palpation: null,
      assessmentDate: new Date("2026-09-01T00:00:00.000Z"),
    });
  });

  it("recusa ausência dos obrigatórios", () => {
    const result = createAssessmentSchema.safeParse({});
    expect(errorsOf(result).sort()).toEqual(["anamnesisId", "assessmentDate", "diagnosis"]);
  });

  it("data inválida, anterior a 1900 ou futura no calendário de São Paulo", () => {
    for (const assessmentDate of ["2026-02-30", "01/09/2026", "1899-12-31", "2999-01-01"]) {
      expect(errorsOf(createAssessmentSchema.safeParse({ ...base, assessmentDate }))).toEqual(["assessmentDate"]);
    }
  });

  it("hoje em São Paulo é aceito, mesmo quando o UTC já está no dia seguinte", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-27T02:00:00Z")); // 26/09 23:00 em São Paulo
    try {
      expect(createAssessmentSchema.safeParse({ ...base, assessmentDate: "2026-09-26" }).success).toBe(true);
      expect(errorsOf(createAssessmentSchema.safeParse({ ...base, assessmentDate: "2026-09-27" }))).toEqual([
        "assessmentDate",
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("respeita os limites de cada campo", () => {
    const tooLong = createAssessmentSchema.safeParse({
      ...base,
      diagnosis: "x".repeat(ASSESSMENT_LIMITS.diagnosis + 1),
      rangeOfMotion: "x".repeat(ASSESSMENT_LIMITS.rangeOfMotion + 1),
    });
    expect(errorsOf(tooLong).sort()).toEqual(["diagnosis", "rangeOfMotion"]);
    const atLimit = createAssessmentSchema.safeParse({ ...base, diagnosis: "x".repeat(ASSESSMENT_LIMITS.diagnosis) });
    expect(atLimit.success).toBe(true);
  });

  it("anamnesisId com formato implausível é recusado", () => {
    expect(errorsOf(createAssessmentSchema.safeParse({ ...base, anamnesisId: "../x" }))).toEqual(["anamnesisId"]);
  });
});

describe("updateAssessmentSchema", () => {
  it("exige a versão carregada (inteiro ≥ 1)", () => {
    expect(updateAssessmentSchema.safeParse({ ...base, version: "2" }).data?.version).toBe(2);
    for (const version of [undefined, "0", "abc", "1.5"]) {
      expect(updateAssessmentSchema.safeParse({ ...base, version }).success).toBe(false);
    }
  });
});

describe("diffAssessment", () => {
  const current = createAssessmentSchema.parse({ ...base, inspection: "Postura antálgica" });

  it("lista só o que mudou, na ordem da tela, com datas em AAAA-MM-DD", () => {
    const next = createAssessmentSchema.parse({ ...base, assessmentDate: "2026-08-31", diagnosis: "Outro" });
    expect(diffAssessment(current, next)).toEqual([
      { field: "assessmentDate", previousValue: "2026-09-01", newValue: "2026-08-31" },
      { field: "inspection", previousValue: "Postura antálgica", newValue: null },
      { field: "diagnosis", previousValue: "Tendinopatia", newValue: "Outro" },
    ]);
  });

  it("sem mudanças devolve lista vazia", () => {
    expect(diffAssessment(current, createAssessmentSchema.parse({ ...base, inspection: " Postura antálgica " }))).toEqual([]);
  });
});

describe("assessmentPageSchema", () => {
  it("página inválida cai na primeira", () => {
    expect(assessmentPageSchema.parse("3")).toBe(3);
    for (const value of [undefined, "0", "-1", "x", "1.5"]) expect(assessmentPageSchema.parse(value)).toBe(1);
  });
});
