/** @jest-environment node */
// Cadastro do primeiro Administrador: exige SETUP_TOKEN e só funciona com a tabela de usuários vazia.
const tx = { user: { count: jest.fn(), create: jest.fn() } };
const prismaMock = {
  user: { findFirst: jest.fn() },
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
jest.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "10.0.0.9" }),
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
jest.mock("../password", () => {
  const actual = jest.requireActual("../password");
  return { ...actual, hashPassword: jest.fn(actual.hashPassword) };
});
const createSession = jest.fn();
const deleteSession = jest.fn();
jest.mock("../session", () => ({
  createSession: (...args: unknown[]) => createSession(...args),
  deleteSession: () => deleteSession(),
}));

import { Prisma } from "@/generated/prisma/client";
import { setupFirstAdmin } from "../actions";
import { hashPassword } from "../password";
import { setupAttemptsByIp } from "../rate-limit";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const TOKEN = "t".repeat(24) + "-codigo-de-setup";
const valid = { setupToken: TOKEN, name: "Ana Souza", email: "Ana@X.com", password: "senha-forte-1", next: "/" };

function prismaError(code: string) {
  const error = new Prisma.PrismaClientKnownRequestError("erro", { code, clientVersion: "test" });
  Object.assign(error, { code });
  return error;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SETUP_TOKEN = TOKEN;
  setupAttemptsByIp.reset("ip:10.0.0.9");
  prismaMock.user.findFirst.mockResolvedValue(null);
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
    const state = await setupFirstAdmin(
      undefined,
      form({ setupToken: TOKEN, name: "A", email: "sem-arroba", password: "123" }),
    );
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

  it("com usuário já cadastrado, recusa antes do scrypt e da transação", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "u1" });
    const state = await setupFirstAdmin(undefined, form(valid));
    expect(state?.error).toMatch(/já foi cadastrado/i);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("bloqueia após 10 tentativas por IP, sem tocar no banco", async () => {
    for (let i = 0; i < 10; i++) await setupFirstAdmin(undefined, form({ name: "A", email: "x", password: "1" }));
    prismaMock.user.findFirst.mockClear();
    const state = await setupFirstAdmin(undefined, form(valid));
    expect(state?.error).toMatch(/Muitas tentativas/i);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["ausente", undefined],
    ["vazio", ""],
    ["curto demais", "curto-demais"],
  ])("com SETUP_TOKEN %s, recusa sem tocar no banco nem gerar hash", async (_caso, token) => {
    if (token === undefined) delete process.env.SETUP_TOKEN;
    else process.env.SETUP_TOKEN = token;
    const state = await setupFirstAdmin(undefined, form({ ...valid, setupToken: token ?? "" }));
    expect(state?.error).toMatch(/não está habilitado/i);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["errado", { setupToken: TOKEN + "x" }],
    ["ausente", { setupToken: undefined }],
  ])("com código %s, recusa em banco vazio sem tocar no banco nem gerar hash", async (_caso, extra) => {
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...valid, ...extra })) if (value !== undefined) fields[key] = value;
    const state = await setupFirstAdmin(undefined, form(fields));
    expect(state?.error).toMatch(/Código de configuração inválido/i);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("não devolve o código nem a senha no estado", async () => {
    const wrong = await setupFirstAdmin(undefined, form({ ...valid, setupToken: "outro-codigo" }));
    tx.user.count.mockResolvedValue(1);
    const closed = await setupFirstAdmin(undefined, form(valid));
    for (const state of [wrong, closed]) {
      const text = JSON.stringify(state);
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain("outro-codigo");
      expect(text).not.toContain(valid.password);
    }
  });
});
