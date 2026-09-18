/** @jest-environment node */
// Chamada direta da Server Action de anamnese: autorização, regras e append-only no servidor.
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
  anamnesis: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), upsert: jest.fn() },
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

import { createAnamnesisVersion } from "../actions";

const SECRET = "SEGREDO-CLINICO-FICTICIO";

function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

const valid = {
  assessmentDate: "2026-09-01",
  chiefComplaint: `Queixa ${SECRET}`,
  painIntensity: "6",
  painTypes: ["PONTADA", "IRRADIADA"],
};

function as(role: string | null) {
  currentUser.current = role ? { id: `u-${role}`, name: `Nome ${role}`, email: `${role}@example.com`, role } : null;
}

let consoleSpies: jest.SpyInstance[];

beforeEach(() => {
  jest.clearAllMocks();
  tx.$queryRaw.mockResolvedValue([{ status: "ATIVO" }]);
  tx.anamnesis.create.mockResolvedValue({ id: "a1" });
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
  expect(tx.anamnesis.create).not.toHaveBeenCalled();
  expect(tx.anamnesis.update).not.toHaveBeenCalled();
  expect(tx.anamnesis.delete).not.toHaveBeenCalled();
}

describe("createAnamnesisVersion", () => {
  it.each(["ADMIN", "FISIOTERAPEUTA"])("%s cria uma nova versão e é redirecionado", async (role) => {
    as(role);
    await expect(createAnamnesisVersion("p1", undefined, form(valid))).rejects.toMatchObject({
      url: "/pacientes/p1/anamnese",
    });
    expect(tx.anamnesis.create).toHaveBeenCalledTimes(1);
    const { data } = tx.anamnesis.create.mock.calls[0][0];
    expect(data).toMatchObject({
      patientId: "p1",
      authorId: `u-${role}`,
      authorNameSnapshot: `Nome ${role}`,
      painIntensity: 6,
      painTypes: ["PONTADA", "IRRADIADA"],
    });
    expect(data.assessmentDate).toEqual(new Date("2026-09-01T00:00:00.000Z"));
    // A linha do paciente é travada (FOR UPDATE) antes de gravar a versão.
    const [sql] = tx.$queryRaw.mock.calls[0];
    expect(sql.join("?")).toMatch(/FOR UPDATE/);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.anamnesis.create.mock.invocationCallOrder[0]);
  });

  it("é append-only: nunca atualiza nem exclui versões", async () => {
    as("FISIOTERAPEUTA");
    await createAnamnesisVersion("p1", undefined, form(valid)).catch(() => {});
    await createAnamnesisVersion("p1", undefined, form(valid)).catch(() => {});
    expect(tx.anamnesis.create).toHaveBeenCalledTimes(2);
    for (const method of ["update", "updateMany", "delete", "deleteMany", "upsert"] as const) {
      expect(tx.anamnesis[method]).not.toHaveBeenCalled();
    }
  });

  it("snapshot e autoria vêm do usuário autenticado, não do formulário", async () => {
    as("FISIOTERAPEUTA");
    const forged = form({ ...valid, authorId: "forjado", authorNameSnapshot: "Forjado", patientId: "outro" });
    await createAnamnesisVersion("p1", undefined, forged).catch(() => {});
    const { data } = tx.anamnesis.create.mock.calls[0][0];
    expect(data.authorId).toBe("u-FISIOTERAPEUTA");
    expect(data.authorNameSnapshot).toBe("Nome FISIOTERAPEUTA");
    expect(data.patientId).toBe("p1");
  });

  it("RECEPCAO recebe acesso negado em chamada direta, sem gravar", async () => {
    as("RECEPCAO");
    await expect(createAnamnesisVersion("p1", undefined, form(valid))).resolves.toEqual({ error: "Acesso negado." });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("usuário inativo ou sem sessão recebe acesso negado, sem gravar", async () => {
    as(null);
    await expect(createAnamnesisVersion("p1", undefined, form(valid))).resolves.toEqual({ error: "Acesso negado." });
    expectNoWrites();
  });

  it("paciente inexistente gera estado controlado", async () => {
    as("ADMIN");
    tx.$queryRaw.mockResolvedValue([]);
    await expect(createAnamnesisVersion("p404", undefined, form(valid))).resolves.toEqual({
      error: "Paciente não encontrado.",
    });
    expectNoWrites();
  });

  it("patientId implausível é recusado antes do banco", async () => {
    as("ADMIN");
    await expect(createAnamnesisVersion("../x", undefined, form(valid))).resolves.toEqual({
      error: "Paciente não encontrado.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("paciente inativo rejeita nova versão com mensagem em pt-BR", async () => {
    as("FISIOTERAPEUTA");
    tx.$queryRaw.mockResolvedValue([{ status: "INATIVO" }]);
    const result = await createAnamnesisVersion("p1", undefined, form(valid));
    expect(result?.error).toMatch(/Paciente inativo não pode receber nova anamnese/);
    expectNoWrites();
  });

  it("validação falha sem gravar e sem ecoar o conteúdo", async () => {
    as("FISIOTERAPEUTA");
    const result = await createAnamnesisVersion(
      "p1",
      undefined,
      form({ ...valid, chiefComplaint: "  ", painIntensity: "11", clinicalNotes: SECRET.repeat(300) }),
    );
    expect(result?.fieldErrors?.chiefComplaint).toEqual(["Informe a queixa principal."]);
    expect(result?.fieldErrors?.painIntensity).toBeDefined();
    expect(result?.fieldErrors?.clinicalNotes).toBeDefined();
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("tipo de dor fora do enum é rejeitado", async () => {
    as("FISIOTERAPEUTA");
    const result = await createAnamnesisVersion("p1", undefined, form({ ...valid, painTypes: ["CHOQUE"] }));
    expect(result?.fieldErrors?.painTypes).toBeDefined();
    expectNoWrites();
  });
});
