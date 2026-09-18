import { LIMITS, anamnesisFormEntries, anamnesisSchema, isPlausibleId } from "../validation";

const base = { assessmentDate: "2026-09-01", chiefComplaint: "Dor lombar fictícia", painTypes: [] as string[] };

function errorsOf(input: Record<string, unknown>) {
  const result = anamnesisSchema.safeParse({ ...base, ...input });
  return result.success ? {} : result.error.flatten().fieldErrors;
}

function dateOffset(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

describe("anamnesisSchema", () => {
  it("aceita o mínimo e normaliza opcionais vazios para null", () => {
    const result = anamnesisSchema.parse({ ...base, currentIllnessHistory: "  ", painIntensity: "" });
    expect(result.chiefComplaint).toBe("Dor lombar fictícia");
    expect(result.currentIllnessHistory).toBeNull();
    expect(result.painIntensity).toBeNull();
    expect(result.assessmentDate.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("exige queixa principal não vazia", () => {
    expect(errorsOf({ chiefComplaint: "   " }).chiefComplaint).toEqual(["Informe a queixa principal."]);
    expect(errorsOf({ chiefComplaint: undefined }).chiefComplaint).toEqual(["Informe a queixa principal."]);
  });

  it("aplica limites de tamanho por campo em pt-BR", () => {
    expect(errorsOf({ chiefComplaint: "x".repeat(LIMITS.chiefComplaint + 1) }).chiefComplaint?.[0]).toMatch(
      /no máximo 500 caracteres/,
    );
    expect(errorsOf({ chiefComplaint: "x".repeat(LIMITS.chiefComplaint) }).chiefComplaint).toBeUndefined();
    expect(
      errorsOf({ clinicalNotes: "x".repeat(LIMITS.clinicalNotes + 1) }).clinicalNotes?.[0],
    ).toMatch(/no máximo 4000/);
    expect(errorsOf({ painLocation: "x".repeat(LIMITS.painLocation + 1) }).painLocation?.[0]).toMatch(/no máximo 200/);
  });

  it("valida a data da avaliação: obrigatória, válida e não futura", () => {
    expect(errorsOf({ assessmentDate: "" }).assessmentDate).toEqual(["Informe a data da avaliação."]);
    expect(errorsOf({ assessmentDate: "2026-02-30" }).assessmentDate).toEqual(["Informe uma data válida."]);
    expect(errorsOf({ assessmentDate: "01/09/2026" }).assessmentDate).toEqual(["Informe uma data válida."]);
    expect(errorsOf({ assessmentDate: dateOffset(2) }).assessmentDate).toEqual([
      "A data da avaliação não pode ser futura.",
    ]);
    expect(errorsOf({ assessmentDate: dateOffset(0) }).assessmentDate).toBeUndefined();
  });

  it.each(["-1", "11", "5.5", "abc", "100"])("rejeita EVA inválida (%s)", (value) => {
    expect(errorsOf({ painIntensity: value }).painIntensity).toEqual([
      "A intensidade da dor (EVA) deve ser um número inteiro de 0 a 10.",
    ]);
  });

  it.each([
    ["0", 0],
    ["10", 10],
    ["7", 7],
  ])("aceita EVA %s", (value, expected) => {
    expect(anamnesisSchema.parse({ ...base, painIntensity: value }).painIntensity).toBe(expected);
  });

  it("aceita múltiplos tipos de dor e rejeita valores fora do enum ou repetidos", () => {
    expect(anamnesisSchema.parse({ ...base, painTypes: ["PONTADA", "IRRADIADA"] }).painTypes).toEqual([
      "PONTADA",
      "IRRADIADA",
    ]);
    expect(errorsOf({ painTypes: ["CHOQUE"] }).painTypes).toBeDefined();
    expect(errorsOf({ painTypes: ["PESO", "PESO"] }).painTypes).toEqual(["Tipo de dor repetido."]);
  });

  it("mensagens de erro não ecoam o conteúdo enviado", () => {
    const secret = "CONTEUDO-SENSIVEL-FICTICIO";
    const result = anamnesisSchema.safeParse({ ...base, chiefComplaint: secret.repeat(40), painIntensity: secret });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.flatten())).not.toContain(secret);
  });
});

describe("anamnesisFormEntries", () => {
  it("sem tipo de dor marcado, painTypes vira lista vazia (nunca null)", () => {
    const entries = anamnesisFormEntries(new FormData());
    expect(entries.painTypes).toEqual([]);
  });

  it("lê painTypes com getAll e ignora campos de autoria enviados pelo cliente", () => {
    const data = new FormData();
    data.set("chiefComplaint", "Queixa");
    data.append("painTypes", "PONTADA");
    data.append("painTypes", "PESO");
    data.set("authorId", "forjado");
    data.set("authorNameSnapshot", "Forjado");
    data.set("patientId", "outro");
    const entries = anamnesisFormEntries(data);
    expect(entries.painTypes).toEqual(["PONTADA", "PESO"]);
    expect(entries).not.toHaveProperty("authorId");
    expect(entries).not.toHaveProperty("authorNameSnapshot");
    expect(entries).not.toHaveProperty("patientId");
  });
});

describe("isPlausibleId", () => {
  it("aceita cuid e recusa valores suspeitos", () => {
    expect(isPlausibleId("cmabc123xyz")).toBe(true);
    expect(isPlausibleId("")).toBe(false);
    expect(isPlausibleId("../x")).toBe(false);
    expect(isPlausibleId("a".repeat(65))).toBe(false);
    expect(isPlausibleId(undefined)).toBe(false);
  });
});
