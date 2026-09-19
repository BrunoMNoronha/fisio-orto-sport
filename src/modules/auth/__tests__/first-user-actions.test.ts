/** @jest-environment node */
const findFirst = jest.fn();
const create = jest.fn();
const $transaction = jest.fn();
jest.mock("@/lib/db", () => ({
  get prisma() {
    return { $transaction };
  },
}));
// A classe vive dentro do factory por causa do hoisting do jest.mock; recuperada abaixo.
jest.mock("@/generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      constructor(public code: string) {
        super(code);
      }
    },
    TransactionIsolationLevel: { Serializable: "Serializable" },
  },
}));
jest.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "10.0.0.7" }),
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
const createSession = jest.fn();
jest.mock("../session", () => ({ createSession: (...args: unknown[]) => createSession(...args) }));

import { Prisma } from "@/generated/prisma/client";
import { registerFirstUser } from "../first-user/actions";
import { firstUserAttemptsByIp } from "../rate-limit";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const valid = { name: "Bruno Noronha", email: "Bruno@Example.COM", password: "senha-forte-1" };

beforeEach(() => {
  jest.clearAllMocks();
  firstUserAttemptsByIp.reset("ip:10.0.0.7");
  findFirst.mockResolvedValue(null);
  create.mockResolvedValue({ id: "u1" });
  // Executa o callback da transação com um "tx" falso.
  $transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn({ user: { findFirst, create } }));
  createSession.mockResolvedValue(true);
});

async function run(fields: Record<string, string> = valid) {
  return registerFirstUser(undefined, form(fields));
}

it("cria o primeiro usuário como ADMIN e entra", async () => {
  await expect(run()).rejects.toThrow("NEXT_REDIRECT:/");

  expect(create).toHaveBeenCalledTimes(1);
  const data = create.mock.calls[0][0].data;
  expect(data.role).toBe("ADMIN");
  expect(data.email).toBe("bruno@example.com"); // normalizado
  expect(data.name).toBe("Bruno Noronha");
  expect(data.passwordHash).toMatch(/^scrypt\$/);
  expect(data.passwordHash).not.toContain(valid.password);
  expect(createSession).toHaveBeenCalledWith("u1", data.passwordHash);
});

it("usa transação serializável", async () => {
  await expect(run()).rejects.toThrow("NEXT_REDIRECT:/");
  expect($transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
});

it("recusa quando já existe usuário, sem criar nada", async () => {
  findFirst.mockResolvedValue({ id: "ja-existe" });

  const state = await run();

  expect(state?.error).toMatch(/já foi concluído/i);
  expect(create).not.toHaveBeenCalled();
  expect(createSession).not.toHaveBeenCalled();
});

it("recusa o perfil enviado pelo formulário e grava sempre ADMIN", async () => {
  await expect(run({ ...valid, role: "RECEPCAO" })).rejects.toThrow("NEXT_REDIRECT:/");
  expect(create.mock.calls[0][0].data.role).toBe("ADMIN");
});

it("valida os campos e devolve nome e e-mail, nunca a senha", async () => {
  const state = await run({ name: "B", email: "invalido", password: "123" });

  expect(state?.fieldErrors?.name).toBeDefined();
  expect(state?.fieldErrors?.email).toBeDefined();
  expect(state?.fieldErrors?.password).toBeDefined();
  expect(state?.values).toEqual({ name: "B", email: "invalido" });
  expect(JSON.stringify(state)).not.toContain("123");
  expect(create).not.toHaveBeenCalled();
});

it("trata a corrida perdida por e-mail duplicado como cadastro encerrado", async () => {
  $transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("P2002", { code: "P2002", clientVersion: "test" }));

  const state = await run();

  expect(state?.error).toMatch(/já foi concluído/i);
  expect(createSession).not.toHaveBeenCalled();
});

it("pede nova tentativa em conflito de serialização", async () => {
  $transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("P2034", { code: "P2034", clientVersion: "test" }));

  const state = await run();

  expect(state?.error).toMatch(/ao mesmo tempo/i);
});

it("bloqueia após o limite de tentativas por IP", async () => {
  for (let i = 0; i < 10; i += 1) await run({ name: "B", email: "invalido", password: "123" });

  const state = await run();

  expect(state?.error).toMatch(/muitas tentativas/i);
  expect(create).not.toHaveBeenCalled();
});

it("volta ao login se a sessão não puder ser criada", async () => {
  createSession.mockResolvedValue(false);
  await expect(run()).rejects.toThrow("NEXT_REDIRECT:/login");
});
