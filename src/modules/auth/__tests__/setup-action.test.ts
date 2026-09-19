/** @jest-environment node */
// Cadastro do primeiro Administrador: só funciona com a tabela de usuários vazia.
const tx = { user: { count: jest.fn(), create: jest.fn() } };
const prismaMock = {
  $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
};
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));
jest.mock("@/generated/prisma/client", () => ({
  Prisma: {
    TransactionIsolationLevel: { Serializable: "Serializable" },
    PrismaClientKnownRequestError: class extends Error {
      code = "";
    },
  },
}));
jest.mock("next/headers", () => ({ headers: async () => new Headers() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
const createSession = jest.fn();
const deleteSession = jest.fn();
jest.mock("../session", () => ({
  createSession: (...args: unknown[]) => createSession(...args),
  deleteSession: () => deleteSession(),
}));

import { Prisma } from "@/generated/prisma/client";
import { setupFirstAdmin } from "../actions";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const valid = { name: "Ana Souza", email: "Ana@X.com", password: "senha-forte-1", next: "/" };

function prismaError(code: string) {
  const error = new Prisma.PrismaClientKnownRequestError("erro", { code, clientVersion: "test" });
  Object.assign(error, { code });
  return error;
}

beforeEach(() => {
  jest.clearAllMocks();
  tx.user.count.mockResolvedValue(0);
  tx.user.create.mockResolvedValue({ id: "u1" });
  createSession.mockResolvedValue(true);
});

describe("setupFirstAdmin", () => {
  it("cria o Administrador com e-mail normalizado, abre sessão e redireciona", async () => {
    await expect(setupFirstAdmin(undefined, form({ ...valid, next: "//evil.com" }))).rejects.toThrow(
      "NEXT_REDIRECT:/",
    );
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Ana Souza", email: "ana@x.com", role: "ADMIN" }),
      }),
    );
    expect(deleteSession).toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledWith("u1", expect.any(String));
  });

  it("recusa quando já existe usuário, sem criar nada", async () => {
    tx.user.count.mockResolvedValue(1);
    const state = await setupFirstAdmin(undefined, form(valid));
    expect(state?.error).toMatch(/já foi cadastrado/i);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("valida os campos e devolve o que foi digitado, sem tocar no banco", async () => {
    const state = await setupFirstAdmin(undefined, form({ name: "A", email: "sem-arroba", password: "123" }));
    expect(state?.fieldErrors?.name).toBeDefined();
    expect(state?.fieldErrors?.email).toBeDefined();
    expect(state?.fieldErrors?.password).toBeDefined();
    expect(state?.values).toEqual({ name: "A", email: "sem-arroba" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("trata a corrida entre duas requisições (P2002 e P2034)", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(prismaError("P2002"));
    await expect(setupFirstAdmin(undefined, form(valid))).resolves.toEqual(
      expect.objectContaining({ error: expect.stringMatching(/já foi cadastrado/i) }),
    );

    prismaMock.$transaction.mockRejectedValueOnce(prismaError("P2034"));
    await expect(setupFirstAdmin(undefined, form(valid))).resolves.toEqual(
      expect.objectContaining({ error: expect.stringMatching(/Tente novamente/i) }),
    );
  });

  it("não redireciona se a sessão não puder ser criada", async () => {
    createSession.mockResolvedValue(false);
    const state = await setupFirstAdmin(undefined, form(valid));
    expect(state?.error).toMatch(/Tente novamente/i);
  });
});
