/** @jest-environment node */
// Chamada direta das Server Actions da avaliação inicial: autorização, regras, autoria e histórico.
const currentUser = { current: null as null | { id: string; name: string; email: string; role: string } };

jest.mock("@/modules/auth/dal", () => {
  const { can } = jest.requireActual("@/modules/auth/permissions");
  class AuthorizationError extends Error {}
  return {
    AuthorizationError,
    // Usuário inativo não tem sessão válida: assertPermission recusa como "sem usuário".
    assertPermission: jest.fn(async (permission: string) => {
      if (!currentUser.current || !can(currentUser.current.role, permission)) throw new AuthorizationError();
      return currentUser.current;
    }),
  };
});

const tx = {
  $queryRaw: jest.fn(),
  anamnesis: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  assessment: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
  assessmentChange: { createMany: jest.fn() },
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

import { createAssessment, updateAssessment } from "../assessment-actions";

const SECRET = "SEGREDO-CLINICO-FICTICIO";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

const valid = {
  assessmentDate: "2026-09-01",
  anamnesisId: "an1",
  rangeOfMotion: "Ombro D, flexão 120 graus",
  diagnosis: `Diagnóstico ${SECRET}`,
};

// Registro gravado, como o findFirst da edição o devolve.
const stored = {
  version: 1,
  assessmentDate: new Date("2026-09-01T00:00:00.000Z"),
  inspection: null,
  palpation: null,
  functionalGait: null,
  rangeOfMotion: "Ombro D, flexão 120 graus",
  muscleStrength: null,
  specialTests: null,
  diagnosis: "Tendinopatia do supraespinal",
  therapeuticGoals: null,
  clinicalNotes: null,
};

const editForm = (overrides: Record<string, string> = {}) =>
  form({
    version: "1",
    assessmentDate: "2026-09-01",
    rangeOfMotion: stored.rangeOfMotion,
    diagnosis: stored.diagnosis,
    ...overrides,
  });

function as(role: string | null) {
  currentUser.current = role ? { id: `u-${role}`, name: `Sessão ${role}`, email: `${role}@example.com`, role } : null;
}

let consoleSpies: jest.SpyInstance[];

beforeEach(() => {
  jest.clearAllMocks();
  tx.$queryRaw.mockResolvedValue([{ status: "ATIVO" }]);
  tx.anamnesis.findFirst.mockResolvedValue({ id: "an1" });
  tx.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    name: `Nome ${where.id}`,
    crefito: where.id === "u-FISIOTERAPEUTA" ? "123456-F" : null,
  }));
  tx.assessment.create.mockResolvedValue({ id: "av1" });
  tx.assessment.findFirst.mockResolvedValue(stored);
  tx.assessment.updateMany.mockResolvedValue({ count: 1 });
  tx.assessmentChange.createMany.mockResolvedValue({ count: 1 });
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
    jest.spyOn(console, level).mockImplementation(() => {}),
  );
});

afterEach(() => {
  // Nenhum dado clínico enviado pode aparecer em logs.
  for (const spy of consoleSpies) {
    expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET);
    spy.mockRestore();
  }
});

function expectNoWrites() {
  expect(tx.assessment.create).not.toHaveBeenCalled();
  expect(tx.assessment.updateMany).not.toHaveBeenCalled();
  expect(tx.assessmentChange.createMany).not.toHaveBeenCalled();
}

describe("createAssessment", () => {
  it.each([
    ["FISIOTERAPEUTA", "123456-F"],
    ["ADMIN", null],
  ])("%s cria e é levado ao detalhe, com assinatura (nome e CREFITO) do servidor", async (role, crefito) => {
    as(role);
    await expect(createAssessment("p1", undefined, form(valid))).rejects.toMatchObject({
      url: "/pacientes/p1/avaliacoes/av1",
    });
    const { data } = tx.assessment.create.mock.calls[0][0];
    expect(data).toMatchObject({
      patientId: "p1",
      anamnesisId: "an1",
      authorId: `u-${role}`,
      authorNameSnapshot: `Nome u-${role}`,
      authorCrefitoSnapshot: crefito,
      rangeOfMotion: valid.rangeOfMotion,
      inspection: null,
    });
    expect(data.assessmentDate).toEqual(new Date("2026-09-01T00:00:00.000Z"));
    // A linha do paciente é travada (FOR UPDATE) antes de gravar.
    const [sql] = tx.$queryRaw.mock.calls[0];
    expect(sql.join("?")).toMatch(/FOR UPDATE/);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.assessment.create.mock.invocationCallOrder[0]);
  });

  it("autoria, paciente e versão não vêm do formulário", async () => {
    as("FISIOTERAPEUTA");
    const forged = form({
      ...valid,
      authorId: "forjado",
      authorNameSnapshot: "Forjado",
      authorCrefitoSnapshot: "999",
      patientId: "outro",
      version: "9",
    });
    await createAssessment("p1", undefined, forged).catch(() => {});
    const { data } = tx.assessment.create.mock.calls[0][0];
    expect(data).toMatchObject({ authorId: "u-FISIOTERAPEUTA", patientId: "p1", authorCrefitoSnapshot: "123456-F" });
    expect(data).not.toHaveProperty("version");
  });

  it("anamnese de outro paciente é recusada no campo, sem gravar", async () => {
    as("FISIOTERAPEUTA");
    tx.anamnesis.findFirst.mockResolvedValue(null);
    const result = await createAssessment("p1", undefined, form({ ...valid, anamnesisId: "alheia" }));
    expect(result).toEqual({ fieldErrors: { anamnesisId: ["Selecione uma anamnese deste paciente."] } });
    expect(tx.anamnesis.findFirst).toHaveBeenCalledWith({ where: { id: "alheia", patientId: "p1" }, select: { id: true } });
    expectNoWrites();
  });

  it("exige data, anamnese e diagnóstico; recusa data futura e limites, sem ecoar conteúdo", async () => {
    as("FISIOTERAPEUTA");
    const result = await createAssessment(
      "p1",
      undefined,
      form({ assessmentDate: "2999-01-01", anamnesisId: "", diagnosis: "   ", clinicalNotes: SECRET.repeat(200) }),
    );
    expect(result?.fieldErrors?.assessmentDate).toEqual(["A data da avaliação não pode ser futura."]);
    expect(result?.fieldErrors?.anamnesisId).toEqual(["Selecione a anamnese de referência."]);
    expect(result?.fieldErrors?.diagnosis).toEqual(["Informe o diagnóstico fisioterapêutico."]);
    expect(result?.fieldErrors?.clinicalNotes).toBeDefined();
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("paciente inativo não recebe avaliação", async () => {
    as("FISIOTERAPEUTA");
    tx.$queryRaw.mockResolvedValue([{ status: "INATIVO" }]);
    const result = await createAssessment("p1", undefined, form(valid));
    expect(result?.error).toMatch(/Paciente inativo não pode receber nova avaliação/);
    expectNoWrites();
  });

  it("RECEPCAO e sessão inválida recebem acesso negado, sem tocar o banco", async () => {
    for (const role of ["RECEPCAO", null]) {
      as(role);
      await expect(createAssessment("p1", undefined, form(valid))).resolves.toEqual({ error: "Acesso negado." });
    }
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("patientId implausível é recusado antes do banco", async () => {
    as("ADMIN");
    await expect(createAssessment("../x", undefined, form(valid))).resolves.toEqual({ error: "Paciente não encontrado." });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("updateAssessment", () => {
  it("grava só os campos alterados no histórico, com valor anterior e assinatura de quem editou", async () => {
    as("FISIOTERAPEUTA");
    await expect(
      updateAssessment("p1", "av1", undefined, editForm({ diagnosis: "Síndrome do impacto", palpation: "Dor no tubérculo maior" })),
    ).rejects.toMatchObject({ url: "/pacientes/p1/avaliacoes/av1" });

    expect(tx.assessment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "av1", patientId: "p1" } }));
    const update = tx.assessment.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: "av1", patientId: "p1", version: 1 });
    expect(update.data).toMatchObject({ version: 2, diagnosis: "Síndrome do impacto", palpation: "Dor no tubérculo maior" });

    const { data } = tx.assessmentChange.createMany.mock.calls[0][0];
    expect(data).toEqual([
      expect.objectContaining({ field: "palpation", previousValue: null, newValue: "Dor no tubérculo maior" }),
      expect.objectContaining({
        field: "diagnosis",
        previousValue: "Tendinopatia do supraespinal",
        newValue: "Síndrome do impacto",
      }),
    ]);
    for (const change of data) {
      expect(change).toMatchObject({
        assessmentId: "av1",
        version: 2,
        editorId: "u-FISIOTERAPEUTA",
        editorNameSnapshot: "Nome u-FISIOTERAPEUTA",
        editorCrefitoSnapshot: "123456-F",
      });
    }
  });

  it("data alterada entra no histórico como AAAA-MM-DD", async () => {
    as("ADMIN");
    await updateAssessment("p1", "av1", undefined, editForm({ assessmentDate: "2026-08-30" })).catch(() => {});
    const { data } = tx.assessmentChange.createMany.mock.calls[0][0];
    expect(data).toEqual([
      expect.objectContaining({ field: "assessmentDate", previousValue: "2026-09-01", newValue: "2026-08-30", editorCrefitoSnapshot: null }),
    ]);
  });

  it("sem mudanças não cria versão nem histórico", async () => {
    as("FISIOTERAPEUTA");
    await expect(updateAssessment("p1", "av1", undefined, editForm())).rejects.toMatchObject({
      url: "/pacientes/p1/avaliacoes/av1",
    });
    expectNoWrites();
  });

  it("versão desatualizada (outra edição salvou antes) é recusada sem gravar", async () => {
    as("FISIOTERAPEUTA");
    tx.assessment.findFirst.mockResolvedValue({ ...stored, version: 2 });
    const result = await updateAssessment("p1", "av1", undefined, editForm({ diagnosis: "Outro" }));
    expect(result?.error).toMatch(/alterada por outra pessoa/);
    expectNoWrites();
  });

  it("corrida perdida no UPDATE também vira conflito, sem histórico", async () => {
    as("FISIOTERAPEUTA");
    tx.assessment.updateMany.mockResolvedValue({ count: 0 });
    const result = await updateAssessment("p1", "av1", undefined, editForm({ diagnosis: "Outro" }));
    expect(result?.error).toMatch(/alterada por outra pessoa/);
    expect(tx.assessmentChange.createMany).not.toHaveBeenCalled();
  });

  it("avaliação de outro paciente (id trocado) responde não encontrada", async () => {
    as("FISIOTERAPEUTA");
    tx.assessment.findFirst.mockResolvedValue(null);
    const result = await updateAssessment("p1", "de-outro", undefined, editForm({ diagnosis: "Outro" }));
    expect(result).toEqual({ error: "Avaliação não encontrada." });
    expectNoWrites();
  });

  it("paciente inativo não aceita edição", async () => {
    as("FISIOTERAPEUTA");
    tx.$queryRaw.mockResolvedValue([{ status: "INATIVO" }]);
    const result = await updateAssessment("p1", "av1", undefined, editForm({ diagnosis: "Outro" }));
    expect(result?.error).toMatch(/Paciente inativo/);
    expectNoWrites();
  });

  it("RECEPCAO recebe acesso negado", async () => {
    as("RECEPCAO");
    await expect(updateAssessment("p1", "av1", undefined, editForm())).resolves.toEqual({ error: "Acesso negado." });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("apagar o diagnóstico obrigatório é recusado", async () => {
    as("FISIOTERAPEUTA");
    const result = await updateAssessment("p1", "av1", undefined, editForm({ diagnosis: "" }));
    expect(result?.fieldErrors?.diagnosis).toEqual(["Informe o diagnóstico fisioterapêutico."]);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("nunca exclui avaliações", async () => {
    as("ADMIN");
    await updateAssessment("p1", "av1", undefined, editForm({ diagnosis: "Outro" })).catch(() => {});
    expect(tx.assessment.delete).not.toHaveBeenCalled();
    expect(tx.assessment.deleteMany).not.toHaveBeenCalled();
  });
});
