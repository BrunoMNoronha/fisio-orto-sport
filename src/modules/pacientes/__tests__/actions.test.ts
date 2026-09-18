/** @jest-environment node */
// Chamada direta das Server Actions de pacientes: a recusa acontece no servidor,
// sem depender de a UI esconder os botões.
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

const prismaMock = {
  patient: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
};
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

jest.mock("@/generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code = "";
    },
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

import { Prisma } from "@/generated/prisma/client";
import * as actions from "../actions";

const { createPatient, setPatientStatus, updatePatient } = actions;

const VALID_CPF = "52998224725";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const adult = { fullName: "Maria Teste", birthDate: "1990-05-10", phone: "11987654321", cpf: VALID_CPF };

function as(role: string | null) {
  currentUser.current = role ? { id: `u-${role}`, name: role, email: `${role}@example.com`, role } : null;
}

function prismaError(code: string) {
  const error = new Prisma.PrismaClientKnownRequestError("erro", { code, clientVersion: "test" });
  (error as { code: string }).code = code;
  return error;
}

async function expectRedirect(promise: Promise<unknown>, url: string) {
  await expect(promise).rejects.toMatchObject({ url });
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.patient.create.mockResolvedValue({ id: "p1" });
  prismaMock.patient.update.mockResolvedValue({ id: "p1" });
  prismaMock.patient.updateMany.mockResolvedValue({ count: 1 });
});

describe.each(["ADMIN", "RECEPCAO"])("%s (pacientes:gerir)", (role) => {
  beforeEach(() => as(role));

  it("cria paciente com autoria e vai para a ficha", async () => {
    await expectRedirect(createPatient(undefined, form(adult)), "/pacientes/p1");
    expect(prismaMock.patient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fullName: "Maria Teste",
        cpf: VALID_CPF,
        phone: "11987654321",
        createdById: `u-${role}`,
        updatedById: `u-${role}`,
        guardianName: null,
        guardianPhone: null,
      }),
      select: { id: true },
    });
  });

  it("edita paciente registrando quem alterou", async () => {
    await expectRedirect(updatePatient(undefined, form({ ...adult, id: "p1", fullName: "Maria Nova" })), "/pacientes/p1");
    const call = prismaMock.patient.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "p1" });
    expect(call.data).toMatchObject({ fullName: "Maria Nova", updatedById: `u-${role}` });
    expect(call.data).not.toHaveProperty("createdById");
    expect(call.data).not.toHaveProperty("status");
  });

  it("inativa e reativa", async () => {
    expect(await setPatientStatus(undefined, form({ id: "p1", status: "INATIVO" }))).toEqual({
      ok: true,
      message: "Paciente inativado.",
    });
    expect(await setPatientStatus(undefined, form({ id: "p1", status: "ATIVO" }))).toEqual({
      ok: true,
      message: "Paciente reativado.",
    });
    expect(prismaMock.patient.updateMany).toHaveBeenLastCalledWith({
      where: { id: "p1" },
      data: { status: "ATIVO", updatedById: `u-${role}` },
    });
  });
});

describe.each([["FISIOTERAPEUTA"], [null]])("sem pacientes:gerir (%s)", (role) => {
  beforeEach(() => as(role));

  it.each([
    ["createPatient", () => createPatient(undefined, form(adult))],
    ["updatePatient", () => updatePatient(undefined, form({ ...adult, id: "p1" }))],
    ["setPatientStatus", () => setPatientStatus(undefined, form({ id: "p1", status: "INATIVO" }))],
  ])("%s é recusada sem tocar no banco", async (_name, run) => {
    expect(await run()).toEqual({ error: "Acesso negado." });
    expect(prismaMock.patient.create).not.toHaveBeenCalled();
    expect(prismaMock.patient.update).not.toHaveBeenCalled();
    expect(prismaMock.patient.updateMany).not.toHaveBeenCalled();
  });
});

describe("regras de cadastro", () => {
  beforeEach(() => as("RECEPCAO"));

  it("CPF duplicado vira erro de campo, sem ecoar o CPF", async () => {
    prismaMock.patient.create.mockRejectedValueOnce(prismaError("P2002"));
    const result = await createPatient(undefined, form(adult));
    expect(result).toEqual({ fieldErrors: { cpf: ["Já existe um paciente com este CPF."] } });
    expect(JSON.stringify(result)).not.toContain(VALID_CPF);
  });

  it("CPF duplicado na edição também vira erro de campo", async () => {
    prismaMock.patient.update.mockRejectedValueOnce(prismaError("P2002"));
    expect(await updatePatient(undefined, form({ ...adult, id: "p1" }))).toEqual({
      fieldErrors: { cpf: ["Já existe um paciente com este CPF."] },
    });
  });

  it("CPF vazio é aceito e gravado como null", async () => {
    await expectRedirect(createPatient(undefined, form({ ...adult, cpf: "" })), "/pacientes/p1");
    expect(prismaMock.patient.create.mock.calls[0][0].data.cpf).toBeNull();
  });

  it("entrada inválida não chega ao banco", async () => {
    const result = await createPatient(undefined, form({ ...adult, phone: "", birthDate: "2999-01-01" }));
    expect(result?.fieldErrors?.phone).toBeDefined();
    expect(result?.fieldErrors?.birthDate).toBeDefined();
    expect(prismaMock.patient.create).not.toHaveBeenCalled();
  });

  it("menor sem responsável é recusado; com responsável é gravado", async () => {
    const minor = { ...adult, cpf: "", birthDate: `${new Date().getUTCFullYear() - 8}-01-01` };
    const refused = await createPatient(undefined, form(minor));
    expect(refused?.fieldErrors?.guardianName).toBeDefined();
    expect(refused?.fieldErrors?.guardianPhone).toBeDefined();
    expect(prismaMock.patient.create).not.toHaveBeenCalled();

    await expectRedirect(
      createPatient(
        undefined,
        form({ ...minor, guardianName: "Ana Responsável", guardianPhone: "11911112222", guardianRelationship: "Mãe" }),
      ),
      "/pacientes/p1",
    );
    expect(prismaMock.patient.create.mock.calls[0][0].data).toMatchObject({
      guardianName: "Ana Responsável",
      guardianPhone: "11911112222",
      guardianRelationship: "Mãe",
    });
  });

  it("edição de paciente inexistente responde não encontrado", async () => {
    prismaMock.patient.update.mockRejectedValueOnce(prismaError("P2025"));
    expect(await updatePatient(undefined, form({ ...adult, id: "x" }))).toEqual({ error: "Paciente não encontrado." });
  });

  it("status de paciente inexistente responde não encontrado", async () => {
    prismaMock.patient.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await setPatientStatus(undefined, form({ id: "x", status: "ATIVO" }))).toEqual({
      error: "Paciente não encontrado.",
    });
  });

  it("status inválido é recusado", async () => {
    expect(await setPatientStatus(undefined, form({ id: "p1", status: "EXCLUIDO" }))).toEqual({
      error: "Dados inválidos.",
    });
    expect(prismaMock.patient.updateMany).not.toHaveBeenCalled();
  });
});

describe("sem exclusão física", () => {
  it("o módulo não exporta ação de exclusão e nunca chama delete", async () => {
    expect(Object.keys(actions).sort()).toEqual(["createPatient", "setPatientStatus", "updatePatient"]);
    as("ADMIN");
    await setPatientStatus(undefined, form({ id: "p1", status: "INATIVO" }));
    expect(prismaMock.patient.delete).not.toHaveBeenCalled();
    expect(prismaMock.patient.deleteMany).not.toHaveBeenCalled();
  });
});
