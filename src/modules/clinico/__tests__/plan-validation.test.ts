import {
  PLAN_LIMITS,
  changePlanStatusSchema,
  createPlanSchema,
  planPageSchema,
  revisePlanSchema,
  revisionNumberSchema,
  samePlanContent,
} from "../plan-validation";

const base = { planDate: "2026-09-10", assessmentId: "av1", goals: "Reduzir dor", conduct: "Cinesioterapia" };

function errorsOf(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((issue) => issue.path.join(".")) ?? [];
}

describe("createPlanSchema", () => {
  it("obrigatórios: data, avaliação, objetivos e conduta; o resto vazio vira null", () => {
    const result = createPlanSchema.safeParse({ ...base, techniques: " ", plannedSessions: "" });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ techniques: null, plannedSessions: null, frequency: null });
    expect(errorsOf(createPlanSchema.safeParse({})).sort()).toEqual(["assessmentId", "conduct", "goals", "planDate"]);
  });

  it("quantidade prevista: inteiro de 1 a 100", () => {
    expect(createPlanSchema.parse({ ...base, plannedSessions: "10" }).plannedSessions).toBe(10);
    expect(createPlanSchema.parse({ ...base, plannedSessions: "100" }).plannedSessions).toBe(100);
    for (const plannedSessions of ["0", "101", "-1", "2.5", "dez", "1e2"]) {
      expect(errorsOf(createPlanSchema.safeParse({ ...base, plannedSessions }))).toEqual(["plannedSessions"]);
    }
  });

  it("data futura, inválida ou anterior a 1900 é recusada", () => {
    for (const planDate of ["2999-01-01", "2026-02-30", "1899-12-31"]) {
      expect(errorsOf(createPlanSchema.safeParse({ ...base, planDate }))).toEqual(["planDate"]);
    }
  });

  it("limites por campo", () => {
    const result = createPlanSchema.safeParse({
      ...base,
      goals: "x".repeat(PLAN_LIMITS.goals + 1),
      frequency: "x".repeat(PLAN_LIMITS.frequency + 1),
    });
    expect(errorsOf(result).sort()).toEqual(["frequency", "goals"]);
  });
});

describe("revisePlanSchema", () => {
  const revision = { ...base, kind: "CORRECAO", reason: "Erro de digitação", baseRevision: "2" };

  it("exige tipo (correção ou mudança clínica), motivo e revisão-base", () => {
    expect(revisePlanSchema.parse(revision)).toMatchObject({ kind: "CORRECAO", baseRevision: 2 });
    expect(errorsOf(revisePlanSchema.safeParse({ ...revision, kind: "INICIAL" }))).toEqual(["kind"]);
    expect(errorsOf(revisePlanSchema.safeParse({ ...revision, reason: "  " }))).toEqual(["reason"]);
    expect(errorsOf(revisePlanSchema.safeParse({ ...revision, baseRevision: "0" }))).toEqual(["baseRevision"]);
  });
});

describe("changePlanStatusSchema", () => {
  it("exige estado válido e motivo", () => {
    expect(changePlanStatusSchema.safeParse({ toStatus: "ENCERRADO", reason: "Objetivos atingidos" }).success).toBe(true);
    expect(errorsOf(changePlanStatusSchema.safeParse({ toStatus: "ALTA", reason: "" })).sort()).toEqual([
      "reason",
      "toStatus",
    ]);
  });
});

describe("samePlanContent", () => {
  it("compara todos os campos do conteúdo, inclusive a data", () => {
    const a = createPlanSchema.parse(base);
    expect(samePlanContent(a, createPlanSchema.parse({ ...base, goals: " Reduzir dor " }))).toBe(true);
    expect(samePlanContent(a, createPlanSchema.parse({ ...base, planDate: "2026-09-11" }))).toBe(false);
    expect(samePlanContent(a, createPlanSchema.parse({ ...base, plannedSessions: "8" }))).toBe(false);
  });
});

describe("parâmetros da URL", () => {
  it("página inválida cai na primeira; número de revisão precisa ser inteiro positivo", () => {
    expect(planPageSchema.parse("x")).toBe(1);
    expect(revisionNumberSchema.safeParse("3").data).toBe(3);
    for (const value of ["0", "-1", "a", "1.5"]) expect(revisionNumberSchema.safeParse(value).success).toBe(false);
  });
});
