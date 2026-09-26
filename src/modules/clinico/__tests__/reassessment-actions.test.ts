/** @jest-environment node */
// Chamada direta das Server Actions de reavaliação: autorização, referências calculadas no servidor,
// comparação congelada, conclusão sem efeitos operacionais, correção com histórico e concorrência.
const currentUser = { current: null as null | { id: string; name: string; email: string; role: string } };

jest.mock("@/modules/auth/dal", () => {
  const { can } = jest.requireActual("@/modules/auth/permissions");
  class AuthorizationError extends Error {}
  return {
    AuthorizationError,
    assertPermission: jest.fn(async (permission: string) => {
      if (!currentUser.current || !can(currentUser.current.role, permission)) throw new AuthorizationError();
      return currentUser.current;
    }),
  };
});

const tx = {
  $queryRaw: jest.fn(),
  user: { findUnique: jest.fn() },
  therapyPlanRevision: { findFirst: jest.fn() },
  assessment: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  reassessment: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
  reassessmentChange: { createMany: jest.fn() },
  therapyPlan: { update: jest.fn(), updateMany: jest.fn() },
  patient: { update: jest.fn(), updateMany: jest.fn() },
  appointment: { update: jest.fn(), updateMany: jest.fn() },
};
const prismaMock = {
  ...tx,
  $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
};
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

class RedirectSignal extends Error {
  constructor(public url: string) {
    super("NEXT_REDIRECT");
  }
}
jest.mock("next/navigation", () => ({
  redirect: jest.fn((url: string) => {
    throw new RedirectSignal(url);
  }),
}));

import { createReassessment, updateReassessment } from "../reassessment-actions";

const SECRET = "SEGREDO-CLINICO-FICTICIO";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

const valid = {
  planId: "pl1",
  reassessmentDate: "2026-09-20",
  rangeOfMotion: "Flexão 150 graus",
  progressSummary: `Melhora ${SECRET}`,
  goalsStatus: "PARCIALMENTE_ATINGIDOS",
  goalsJustification: "Dor ainda limita",
  conclusion: "INDICACAO_ALTA",
  conclusionSummary: "Alta indicada",
};

const exam = { inspection: null, palpation: null, functionalGait: null, rangeOfMotion: "Flexão 120", muscleStrength: null, specialTests: null };

const stored = {
  version: 1,
  planId: "pl1",
  reassessmentDate: new Date("2026-09-20T00:00:00.000Z"),
  ...exam,
  rangeOfMotion: "Flexão 150 graus",
  painLimitations: null,
  progressSummary: "Melhora",
  goalsStatus: "PARCIALMENTE_ATINGIDOS",
  goalsJustification: "Dor ainda limita",
  conclusion: "AJUSTE_PLANO",
  conclusionSummary: "Progredir",
  planRevision: { planDate: new Date("2026-09-10T00:00:00.000Z") },
};

function as(role: string | null) {
  currentUser.current = role ? { id: `u${role}`, name: `Sessão ${role}`, email: `${role}@example.com`, role } : null;
}

let consoleSpies: jest.SpyInstance[];

beforeEach(() => {
  jest.clearAllMocks();
  // Zera implementações (inclusive "Once" pendentes) só dos mocks do banco.
  tx.$queryRaw.mockReset();
  for (const model of Object.values(tx)) {
    if (typeof model === "object") for (const fn of Object.values(model)) (fn as jest.Mock).mockReset();
  }
  tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) =>
    sql.join("?").includes('"TherapyPlan"') ? [{ status: "ATIVO", assessmentId: "av1" }] : [{ status: "ATIVO" }],
  );
  tx.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    name: `Nome ${where.id}`,
    crefito: where.id === "uFISIOTERAPEUTA" ? "123456-F" : null,
  }));
  tx.therapyPlanRevision.findFirst.mockImplementation(async ({ where }: { where: { number?: number } }) =>
    where.number === 1 ? { planDate: new Date("2026-09-02T00:00:00.000Z") } : { id: "r2" },
  );
  tx.assessment.findFirst.mockResolvedValue({
    id: "av1",
    version: 3,
    assessmentDate: new Date("2026-09-01T00:00:00.000Z"),
    diagnosis: "Tendinopatia",
    ...exam,
  });
  tx.reassessment.create.mockResolvedValue({ id: "re2" });
  tx.reassessment.findFirst.mockResolvedValue(null);
  tx.reassessment.updateMany.mockResolvedValue({ count: 1 });
  tx.reassessmentChange.createMany.mockResolvedValue({ count: 1 });
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
    jest.spyOn(console, level).mockImplementation(() => {}),
  );
});

afterEach(() => {
  for (const spy of consoleSpies) {
    expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET);
    spy.mockRestore();
  }
});

function expectNoWrites() {
  expect(tx.reassessment.create).not.toHaveBeenCalled();
  expect(tx.reassessment.updateMany).not.toHaveBeenCalled();
  expect(tx.reassessmentChange.createMany).not.toHaveBeenCalled();
}

describe("createReassessment", () => {
  it("calcula as referências no servidor e congela a comparação (avaliação e reavaliação anterior)", async () => {
    as("FISIOTERAPEUTA");
    tx.reassessment.findFirst.mockResolvedValue({
      id: "re1",
      reassessmentDate: new Date("2026-09-10T00:00:00.000Z"),
      painLimitations: null,
      progressSummary: "Início",
      goalsStatus: "NAO_ATINGIDOS",
      conclusion: "CONTINUIDADE",
      ...exam,
    });
    await expect(createReassessment("p1", undefined, form(valid))).rejects.toMatchObject({
      url: "/pacientes/p1/reavaliacoes/re2",
    });
    // Revisão aplicável na data: a de maior número com data até a reavaliação.
    expect(tx.therapyPlanRevision.findFirst).toHaveBeenCalledWith({
      where: { planId: "pl1", planDate: { lte: new Date("2026-09-20T00:00:00.000Z") } },
      orderBy: { number: "desc" },
      select: { id: true },
    });
    const { data } = tx.reassessment.create.mock.calls[0][0];
    expect(data).toMatchObject({
      patientId: "p1",
      planId: "pl1",
      planRevisionId: "r2",
      assessmentId: "av1",
      previousReassessmentId: "re1",
      conclusion: "INDICACAO_ALTA",
      authorId: "uFISIOTERAPEUTA",
      authorCrefitoSnapshot: "123456-F",
    });
    expect(data.referenceSnapshot).toEqual({
      assessment: { id: "av1", version: 3, assessmentDate: "2026-09-01", diagnosis: "Tendinopatia", ...exam },
      previous: {
        id: "re1",
        reassessmentDate: "2026-09-10",
        painLimitations: null,
        progressSummary: "Início",
        goalsStatus: "NAO_ATINGIDOS",
        conclusion: "CONTINUIDADE",
        ...exam,
      },
    });
    const sqls = tx.$queryRaw.mock.calls.map(([sql]) => sql.join("?"));
    expect(sqls[0]).toMatch(/"Patient".*FOR UPDATE/);
    expect(sqls[1]).toMatch(/"TherapyPlan".*"patientId".*FOR SHARE/);
  });

  it("indicação de alta não encerra plano, não inativa paciente e não mexe na agenda", async () => {
    as("ADMIN");
    await createReassessment("p1", undefined, form(valid)).catch(() => {});
    expect(tx.reassessment.create).toHaveBeenCalled();
    for (const fn of [tx.therapyPlan.update, tx.therapyPlan.updateMany, tx.patient.update, tx.patient.updateMany, tx.appointment.update, tx.appointment.updateMany]) {
      expect(fn).not.toHaveBeenCalled();
    }
    // Nem altera a avaliação de referência.
    expect(tx.assessment.update).not.toHaveBeenCalled();
  });

  it("primeira reavaliação do plano não tem anterior", async () => {
    as("ADMIN");
    await createReassessment("p1", undefined, form(valid)).catch(() => {});
    const { data } = tx.reassessment.create.mock.calls[0][0];
    expect(data.previousReassessmentId).toBeNull();
    expect(data.referenceSnapshot.previous).toBeNull();
  });

  it("plano de outro paciente, plano encerrado e data antes do início do plano são recusados", async () => {
    as("FISIOTERAPEUTA");
    tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => (sql.join("?").includes('"TherapyPlan"') ? [] : [{ status: "ATIVO" }]));
    expect((await createReassessment("p1", undefined, form(valid)))?.fieldErrors?.planId).toEqual(["Selecione um plano deste paciente."]);
    tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) =>
      sql.join("?").includes('"TherapyPlan"') ? [{ status: "ENCERRADO", assessmentId: "av1" }] : [{ status: "ATIVO" }],
    );
    expect((await createReassessment("p1", undefined, form(valid)))?.fieldErrors?.planId?.[0]).toMatch(/Plano encerrado/);
    tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) =>
      sql.join("?").includes('"TherapyPlan"') ? [{ status: "ATIVO", assessmentId: "av1" }] : [{ status: "ATIVO" }],
    );
    expect(
      (await createReassessment("p1", undefined, form({ ...valid, reassessmentDate: "2026-09-01" })))?.fieldErrors?.reassessmentDate?.[0],
    ).toMatch(/anterior ao início do plano \(02\/09\/2026\)/);
    expectNoWrites();
  });

  it("obrigatórios ausentes são recusados sem ecoar conteúdo; autoria não vem do formulário", async () => {
    as("FISIOTERAPEUTA");
    const result = await createReassessment("p1", undefined, form({ planId: "pl1", reassessmentDate: "2026-09-20", notes: SECRET }));
    expect(Object.keys(result?.fieldErrors ?? {}).sort()).toEqual(
      ["conclusion", "conclusionSummary", "goalsJustification", "goalsStatus", "progressSummary"].sort(),
    );
    expect(JSON.stringify(result)).not.toContain(SECRET);
    await createReassessment("p1", undefined, form({ ...valid, authorId: "x", planRevisionId: "forjada", previousReassessmentId: "y" })).catch(() => {});
    expect(tx.reassessment.create.mock.calls[0][0].data).toMatchObject({ authorId: "uFISIOTERAPEUTA", planRevisionId: "r2", previousReassessmentId: null });
  });

  it("paciente inativo, RECEPCAO e sessão inválida não gravam", async () => {
    as("FISIOTERAPEUTA");
    tx.$queryRaw.mockResolvedValue([{ status: "INATIVO" }]);
    expect((await createReassessment("p1", undefined, form(valid)))?.error).toMatch(/Paciente inativo/);
    for (const role of ["RECEPCAO", null]) {
      as(role);
      await expect(createReassessment("p1", undefined, form(valid))).resolves.toEqual({ error: "Acesso negado." });
    }
    expectNoWrites();
  });
});

describe("updateReassessment", () => {
  const edit = (overrides: Record<string, string> = {}) =>
    form({
      version: "1",
      reason: "Digitação",
      reassessmentDate: "2026-09-20",
      rangeOfMotion: "Flexão 150 graus",
      progressSummary: "Melhora",
      goalsStatus: "PARCIALMENTE_ATINGIDOS",
      goalsJustification: "Dor ainda limita",
      conclusion: "AJUSTE_PLANO",
      conclusionSummary: "Progredir",
      ...overrides,
    });

  beforeEach(() => tx.reassessment.findFirst.mockResolvedValue(stored));

  it("grava só os campos alterados, com motivo e assinatura, sem mudar as referências", async () => {
    as("ADMIN");
    await expect(updateReassessment("p1", "re2", undefined, edit({ conclusion: "CONTINUIDADE" }))).rejects.toMatchObject({
      url: "/pacientes/p1/reavaliacoes/re2",
    });
    const update = tx.reassessment.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: "re2", patientId: "p1", version: 1 });
    expect(update.data).not.toHaveProperty("planRevisionId");
    expect(update.data).not.toHaveProperty("referenceSnapshot");
    expect(tx.reassessmentChange.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ field: "conclusion", previousValue: "AJUSTE_PLANO", newValue: "CONTINUIDADE", reason: "Digitação", version: 2, editorId: "uADMIN" }),
    ]);
  });

  it("data antes da revisão de referência, versão desatualizada e id alheio são recusados", async () => {
    as("FISIOTERAPEUTA");
    expect((await updateReassessment("p1", "re2", undefined, edit({ reassessmentDate: "2026-09-05" })))?.fieldErrors?.reassessmentDate?.[0]).toMatch(
      /revisão do plano de referência \(10\/09\/2026\)/,
    );
    tx.reassessment.findFirst.mockResolvedValueOnce({ ...stored, version: 2 });
    expect((await updateReassessment("p1", "re2", undefined, edit({ conclusion: "CONTINUIDADE" })))?.error).toMatch(/alterada por outra pessoa/);
    tx.reassessment.findFirst.mockResolvedValueOnce(null);
    expect(await updateReassessment("p1", "alheia", undefined, edit({ conclusion: "CONTINUIDADE" }))).toEqual({ error: "Reavaliação não encontrada." });
    expectNoWrites();
  });

  it("corrida perdida no UPDATE vira conflito sem histórico; sem mudanças não grava", async () => {
    as("FISIOTERAPEUTA");
    tx.reassessment.updateMany.mockResolvedValue({ count: 0 });
    expect((await updateReassessment("p1", "re2", undefined, edit({ conclusion: "CONTINUIDADE" })))?.error).toMatch(/alterada por outra pessoa/);
    expect(tx.reassessmentChange.createMany).not.toHaveBeenCalled();
    tx.reassessment.updateMany.mockClear();
    await expect(updateReassessment("p1", "re2", undefined, edit())).rejects.toMatchObject({ url: "/pacientes/p1/reavaliacoes/re2" });
    expect(tx.reassessment.updateMany).not.toHaveBeenCalled();
  });

  it("RECEPCAO recebe acesso negado", async () => {
    as("RECEPCAO");
    await expect(updateReassessment("p1", "re2", undefined, edit())).resolves.toEqual({ error: "Acesso negado." });
  });
});
