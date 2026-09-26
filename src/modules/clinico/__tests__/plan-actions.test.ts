/** @jest-environment node */
// Chamada direta das Server Actions do plano: autorização, origem, revisões imutáveis, estados e concorrência.
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
  assessment: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  therapyPlan: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
  therapyPlanRevision: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
  therapyPlanStatusChange: { create: jest.fn() },
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

import { changePlanStatus, createPlan, revisePlan } from "../plan-actions";

const SECRET = "SEGREDO-CLINICO-FICTICIO";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

const valid = {
  assessmentId: "av1",
  planDate: "2026-09-10",
  goals: "Reduzir dor",
  conduct: `Cinesioterapia ${SECRET}`,
  plannedSessions: "10",
};

// Revisão vigente, como o findFirst da revisão a devolve.
const currentContent = {
  planDate: new Date("2026-09-10T00:00:00.000Z"),
  goals: "Reduzir dor",
  conduct: "Cinesioterapia",
  techniques: null,
  exercises: null,
  plannedSessions: 10,
  frequency: null,
  reassessment: null,
  notes: null,
};

const reviseForm = (overrides: Record<string, string> = {}) =>
  form({
    planDate: "2026-09-10",
    goals: "Reduzir dor",
    conduct: "Cinesioterapia",
    plannedSessions: "12",
    kind: "MUDANCA_CLINICA",
    reason: "Evolução mais lenta",
    baseRevision: "1",
    ...overrides,
  });

function as(role: string | null) {
  currentUser.current = role ? { id: `u-${role}`, name: `Sessão ${role}`, email: `${role}@example.com`, role } : null;
}

let consoleSpies: jest.SpyInstance[];

beforeEach(() => {
  jest.clearAllMocks();
  tx.$queryRaw.mockResolvedValue([{ status: "ATIVO" }]);
  tx.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    name: `Nome ${where.id}`,
    crefito: where.id === "u-FISIOTERAPEUTA" ? "123456-F" : null,
  }));
  tx.assessment.findFirst.mockResolvedValue({ version: 3, assessmentDate: new Date("2026-09-01T00:00:00.000Z") });
  tx.therapyPlan.create.mockResolvedValue({ id: "pl1" });
  tx.therapyPlan.findFirst.mockResolvedValue({
    status: "ATIVO",
    currentRevision: 1,
    assessment: { assessmentDate: new Date("2026-09-01T00:00:00.000Z") },
    revisions: [currentContent],
  });
  tx.therapyPlan.updateMany.mockResolvedValue({ count: 1 });
  tx.therapyPlanRevision.create.mockResolvedValue({ id: "r2" });
  tx.therapyPlanStatusChange.create.mockResolvedValue({ id: "s1" });
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
  expect(tx.therapyPlan.create).not.toHaveBeenCalled();
  expect(tx.therapyPlan.updateMany).not.toHaveBeenCalled();
  expect(tx.therapyPlanRevision.create).not.toHaveBeenCalled();
  expect(tx.therapyPlanStatusChange.create).not.toHaveBeenCalled();
}

describe("createPlan", () => {
  it.each([
    ["FISIOTERAPEUTA", "123456-F"],
    ["ADMIN", null],
  ])("%s cria o plano com a revisão 1 (INICIAL), origem e versão da avaliação", async (role, crefito) => {
    as(role);
    await expect(createPlan("p1", undefined, form(valid))).rejects.toMatchObject({ url: "/pacientes/p1/planos/pl1" });
    const { data } = tx.therapyPlan.create.mock.calls[0][0];
    expect(data).toMatchObject({
      patientId: "p1",
      assessmentId: "av1",
      assessmentVersion: 3,
      authorId: `u-${role}`,
      authorNameSnapshot: `Nome u-${role}`,
      authorCrefitoSnapshot: crefito,
    });
    expect(data.revisions.create).toMatchObject({
      number: 1,
      kind: "INICIAL",
      goals: "Reduzir dor",
      plannedSessions: 10,
      authorCrefitoSnapshot: crefito,
    });
    expect(data.revisions.create).not.toHaveProperty("reason");
    const [sql] = tx.$queryRaw.mock.calls[0];
    expect(sql.join("?")).toMatch(/FOR UPDATE/);
  });

  it("nunca altera a avaliação de origem", async () => {
    as("FISIOTERAPEUTA");
    await createPlan("p1", undefined, form(valid)).catch(() => {});
    expect(tx.assessment.update).not.toHaveBeenCalled();
    expect(tx.assessment.updateMany).not.toHaveBeenCalled();
  });

  it("avaliação de outro paciente é recusada no campo", async () => {
    as("FISIOTERAPEUTA");
    tx.assessment.findFirst.mockResolvedValue(null);
    const result = await createPlan("p1", undefined, form({ ...valid, assessmentId: "alheia" }));
    expect(result).toEqual({ fieldErrors: { assessmentId: ["Selecione uma avaliação deste paciente."] } });
    expect(tx.assessment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "alheia", patientId: "p1" } }));
    expectNoWrites();
  });

  it("data do plano anterior à avaliação de origem é recusada", async () => {
    as("FISIOTERAPEUTA");
    const result = await createPlan("p1", undefined, form({ ...valid, planDate: "2026-08-31" }));
    expect(result?.fieldErrors?.planDate).toEqual([
      "A data do plano não pode ser anterior à data da avaliação de origem (01/09/2026).",
    ]);
    expectNoWrites();
  });

  it("obrigatórios vazios e quantidade inválida são recusados sem ecoar conteúdo", async () => {
    as("FISIOTERAPEUTA");
    const result = await createPlan(
      "p1",
      undefined,
      form({ assessmentId: "av1", planDate: "2026-09-10", goals: "", conduct: " ", plannedSessions: "0", notes: SECRET.repeat(300) }),
    );
    expect(Object.keys(result?.fieldErrors ?? {}).sort()).toEqual(["conduct", "goals", "notes", "plannedSessions"]);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("autoria e paciente não vêm do formulário", async () => {
    as("FISIOTERAPEUTA");
    await createPlan("p1", undefined, form({ ...valid, authorId: "x", patientId: "outro", assessmentVersion: "99", status: "ENCERRADO" })).catch(
      () => {},
    );
    const { data } = tx.therapyPlan.create.mock.calls[0][0];
    expect(data).toMatchObject({ authorId: "u-FISIOTERAPEUTA", patientId: "p1", assessmentVersion: 3 });
    expect(data).not.toHaveProperty("status");
  });

  it("paciente inativo, RECEPCAO e sessão inválida não gravam", async () => {
    as("FISIOTERAPEUTA");
    tx.$queryRaw.mockResolvedValue([{ status: "INATIVO" }]);
    expect((await createPlan("p1", undefined, form(valid)))?.error).toMatch(/Paciente inativo/);
    for (const role of ["RECEPCAO", null]) {
      as(role);
      await expect(createPlan("p1", undefined, form(valid))).resolves.toEqual({ error: "Acesso negado." });
    }
    expectNoWrites();
  });
});

describe("revisePlan", () => {
  it("cria a revisão seguinte, com tipo, motivo e assinatura, sem alterar as anteriores", async () => {
    as("FISIOTERAPEUTA");
    await expect(revisePlan("p1", "pl1", undefined, reviseForm())).rejects.toMatchObject({ url: "/pacientes/p1/planos/pl1" });
    expect(tx.therapyPlan.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pl1", patientId: "p1" } }));
    expect(tx.therapyPlan.updateMany).toHaveBeenCalledWith({
      where: { id: "pl1", patientId: "p1", currentRevision: 1, status: "ATIVO" },
      data: { currentRevision: 2, updatedAt: expect.any(Date) },
    });
    const { data } = tx.therapyPlanRevision.create.mock.calls[0][0];
    expect(data).toMatchObject({
      planId: "pl1",
      number: 2,
      kind: "MUDANCA_CLINICA",
      reason: "Evolução mais lenta",
      plannedSessions: 12,
      authorNameSnapshot: "Nome u-FISIOTERAPEUTA",
      authorCrefitoSnapshot: "123456-F",
    });
    expect(tx.therapyPlanRevision.update).not.toHaveBeenCalled();
    expect(tx.therapyPlanRevision.updateMany).not.toHaveBeenCalled();
    expect(tx.therapyPlanRevision.delete).not.toHaveBeenCalled();
  });

  it("revisão-base desatualizada é recusada (outra revisão foi salva antes)", async () => {
    as("FISIOTERAPEUTA");
    tx.therapyPlan.findFirst.mockResolvedValue({
      status: "ATIVO",
      currentRevision: 2,
      assessment: { assessmentDate: new Date("2026-09-01T00:00:00.000Z") },
      revisions: [currentContent],
    });
    expect((await revisePlan("p1", "pl1", undefined, reviseForm()))?.error).toMatch(/revisado ou mudou de estado/);
    expectNoWrites();
  });

  it("corrida perdida no UPDATE também é conflito e não grava a revisão", async () => {
    as("FISIOTERAPEUTA");
    tx.therapyPlan.updateMany.mockResolvedValue({ count: 0 });
    expect((await revisePlan("p1", "pl1", undefined, reviseForm()))?.error).toMatch(/revisado ou mudou de estado/);
    expect(tx.therapyPlanRevision.create).not.toHaveBeenCalled();
  });

  it("conteúdo idêntico à vigente não cria revisão", async () => {
    as("FISIOTERAPEUTA");
    const result = await revisePlan("p1", "pl1", undefined, reviseForm({ plannedSessions: "10" }));
    expect(result?.error).toMatch(/Nenhuma alteração/);
    expectNoWrites();
  });

  it("plano encerrado não recebe revisão", async () => {
    as("FISIOTERAPEUTA");
    tx.therapyPlan.findFirst.mockResolvedValue({
      status: "ENCERRADO",
      currentRevision: 1,
      assessment: { assessmentDate: new Date("2026-09-01T00:00:00.000Z") },
      revisions: [currentContent],
    });
    expect((await revisePlan("p1", "pl1", undefined, reviseForm()))?.error).toMatch(/Plano encerrado/);
    expectNoWrites();
  });

  it("plano de outro paciente responde não encontrado", async () => {
    as("ADMIN");
    tx.therapyPlan.findFirst.mockResolvedValue(null);
    expect(await revisePlan("p1", "alheio", undefined, reviseForm())).toEqual({ error: "Plano não encontrado." });
    expectNoWrites();
  });

  it("exige tipo e motivo", async () => {
    as("FISIOTERAPEUTA");
    const result = await revisePlan("p1", "pl1", undefined, reviseForm({ kind: "", reason: "" }));
    expect(Object.keys(result?.fieldErrors ?? {}).sort()).toEqual(["kind", "reason"]);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("RECEPCAO recebe acesso negado", async () => {
    as("RECEPCAO");
    await expect(revisePlan("p1", "pl1", undefined, reviseForm())).resolves.toEqual({ error: "Acesso negado." });
  });
});

describe("changePlanStatus", () => {
  it("encerra com motivo e registra a mudança", async () => {
    as("FISIOTERAPEUTA");
    const result = await changePlanStatus("p1", "pl1", undefined, form({ toStatus: "ENCERRADO", reason: "Objetivos atingidos" }));
    expect(result).toEqual({ ok: true, message: "Plano encerrado." });
    expect(tx.therapyPlan.updateMany).toHaveBeenCalledWith({
      where: { id: "pl1", patientId: "p1", status: "ATIVO" },
      data: { status: "ENCERRADO", updatedAt: expect.any(Date) },
    });
    expect(tx.therapyPlanStatusChange.create.mock.calls[0][0].data).toMatchObject({
      planId: "pl1",
      fromStatus: "ATIVO",
      toStatus: "ENCERRADO",
      reason: "Objetivos atingidos",
      authorCrefitoSnapshot: "123456-F",
    });
  });

  it("reabre um plano encerrado", async () => {
    as("ADMIN");
    const result = await changePlanStatus("p1", "pl1", undefined, form({ toStatus: "ATIVO", reason: "Nova queixa" }));
    expect(result).toEqual({ ok: true, message: "Plano reaberto." });
    expect(tx.therapyPlan.updateMany.mock.calls[0][0].where).toEqual({ id: "pl1", patientId: "p1", status: "ENCERRADO" });
  });

  it("estado já alterado (ou concorrente) é conflito; plano alheio é não encontrado", async () => {
    as("FISIOTERAPEUTA");
    tx.therapyPlan.updateMany.mockResolvedValue({ count: 0 });
    tx.therapyPlan.findFirst.mockResolvedValueOnce({ id: "pl1" }).mockResolvedValueOnce(null);
    expect((await changePlanStatus("p1", "pl1", undefined, form({ toStatus: "ENCERRADO", reason: "x" })))?.error).toMatch(
      /mudou de estado/,
    );
    expect(await changePlanStatus("p1", "alheio", undefined, form({ toStatus: "ENCERRADO", reason: "x" }))).toEqual({
      error: "Plano não encontrado.",
    });
    expect(tx.therapyPlanStatusChange.create).not.toHaveBeenCalled();
  });

  it("exige motivo; paciente inativo e RECEPCAO não alteram", async () => {
    as("FISIOTERAPEUTA");
    expect((await changePlanStatus("p1", "pl1", undefined, form({ toStatus: "ENCERRADO", reason: "" })))?.fieldErrors?.reason).toBeDefined();
    tx.$queryRaw.mockResolvedValue([{ status: "INATIVO" }]);
    expect((await changePlanStatus("p1", "pl1", undefined, form({ toStatus: "ENCERRADO", reason: "x" })))?.error).toMatch(
      /Paciente inativo/,
    );
    as("RECEPCAO");
    expect(await changePlanStatus("p1", "pl1", undefined, form({ toStatus: "ENCERRADO", reason: "x" }))).toEqual({
      error: "Acesso negado.",
    });
    expectNoWrites();
  });
});
