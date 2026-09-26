import {
  REASSESSMENT_LIMITS,
  createReassessmentSchema,
  diffReassessment,
  reassessmentPageSchema,
  updateReassessmentSchema,
} from "../reassessment-validation";

const base = {
  planId: "pl1",
  reassessmentDate: "2026-09-20",
  progressSummary: "Melhora da ADM",
  goalsStatus: "PARCIALMENTE_ATINGIDOS",
  goalsJustification: "Dor ainda limita",
  conclusion: "AJUSTE_PLANO",
  conclusionSummary: "Progredir carga",
};

function errorsOf(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((issue) => issue.path.join(".")) ?? [];
}

describe("createReassessmentSchema", () => {
  it("obrigatórios: data, plano, evolução, situação e justificativa dos objetivos, conclusão e síntese", () => {
    expect(errorsOf(createReassessmentSchema.safeParse({})).sort()).toEqual(
      ["conclusion", "conclusionSummary", "goalsJustification", "goalsStatus", "planId", "progressSummary", "reassessmentDate"].sort(),
    );
  });

  it("exame físico e dor/limitações são opcionais; vazio vira null (não informado)", () => {
    const result = createReassessmentSchema.parse({ ...base, inspection: " ", painLimitations: "" });
    expect(result).toMatchObject({ inspection: null, painLimitations: null, rangeOfMotion: null });
  });

  it("situação e conclusão só aceitam as opções definidas", () => {
    expect(errorsOf(createReassessmentSchema.safeParse({ ...base, goalsStatus: "MELHOROU" }))).toEqual(["goalsStatus"]);
    expect(errorsOf(createReassessmentSchema.safeParse({ ...base, conclusion: "ALTA_AUTOMATICA" }))).toEqual(["conclusion"]);
  });

  it("data futura ou inválida e limites excedidos são recusados", () => {
    expect(errorsOf(createReassessmentSchema.safeParse({ ...base, reassessmentDate: "2999-01-01" }))).toEqual([
      "reassessmentDate",
    ]);
    expect(
      errorsOf(
        createReassessmentSchema.safeParse({ ...base, conclusionSummary: "x".repeat(REASSESSMENT_LIMITS.conclusionSummary + 1) }),
      ),
    ).toEqual(["conclusionSummary"]);
  });
});

describe("updateReassessmentSchema e diff", () => {
  it("correção exige versão e motivo", () => {
    const { planId: _unused, ...fields } = base;
    void _unused;
    expect(errorsOf(updateReassessmentSchema.safeParse({ ...fields, version: "0", reason: "" })).sort()).toEqual(["reason", "version"]);
  });

  it("diff lista só o que mudou, com data em AAAA-MM-DD e valores de opção brutos", () => {
    const current = createReassessmentSchema.parse(base);
    const next = createReassessmentSchema.parse({ ...base, reassessmentDate: "2026-09-19", conclusion: "CONTINUIDADE", palpation: "Dor" });
    expect(diffReassessment(current, next)).toEqual([
      { field: "reassessmentDate", previousValue: "2026-09-20", newValue: "2026-09-19" },
      { field: "palpation", previousValue: null, newValue: "Dor" },
      { field: "conclusion", previousValue: "AJUSTE_PLANO", newValue: "CONTINUIDADE" },
    ]);
  });

  it("página inválida cai na primeira", () => {
    expect(reassessmentPageSchema.parse("-2")).toBe(1);
  });
});
