/** @jest-environment node */
const findUnique = jest.fn();
jest.mock("@/lib/db", () => ({
  get prisma() {
    return { user: { findUnique } };
  },
}));
jest.mock("@/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "10.0.0.1" }),
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
const createSession = jest.fn();
jest.mock("../session", () => ({
  createSession: (...args: unknown[]) => createSession(...args),
  deleteSession: jest.fn(),
}));

import { login } from "../actions";
import { hashPassword } from "../password";
import { loginAttemptsByIp, loginFailuresByEmail } from "../rate-limit";

function form(email: string, password: string, next = "/") {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  fd.set("next", next);
  return fd;
}

let hash: string;
beforeAll(async () => {
  hash = await hashPassword("senha-correta-1");
});

beforeEach(() => {
  jest.clearAllMocks();
  loginAttemptsByIp.reset("ip:10.0.0.1");
  loginFailuresByEmail.reset("email:ana@x.com");
  findUnique.mockResolvedValue({ id: "u1", passwordHash: hash, active: true });
  createSession.mockResolvedValue(true);
});

describe("login", () => {
  it("autentica e redireciona só para caminho interno", async () => {
    await expect(login(undefined, form("Ana@X.com", "senha-correta-1", "/\t/evil.com"))).rejects.toThrow(
      "NEXT_REDIRECT:/",
    );
    expect(createSession).toHaveBeenCalledWith("u1", hash);
  });

  it("mensagem genérica para senha errada, usuário inexistente e inativo", async () => {
    const generic = { error: "E-mail ou senha inválidos.", email: "ana@x.com" };
    await expect(login(undefined, form("ana@x.com", "errada-123"))).resolves.toEqual(generic);
    findUnique.mockResolvedValueOnce(null);
    await expect(login(undefined, form("ana@x.com", "senha-correta-1"))).resolves.toEqual(generic);
    findUnique.mockResolvedValueOnce({ id: "u1", passwordHash: hash, active: false });
    await expect(login(undefined, form("ana@x.com", "senha-correta-1"))).resolves.toEqual(generic);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("não cria sessão se a senha mudou durante o login", async () => {
    createSession.mockResolvedValueOnce(false);
    await expect(login(undefined, form("ana@x.com", "senha-correta-1"))).resolves.toMatchObject({
      error: "E-mail ou senha inválidos.",
    });
  });

  it("bloqueia a conta após 5 falhas, mesmo com a senha certa", async () => {
    for (let i = 0; i < 5; i++) await login(undefined, form("ana@x.com", `errada-${i}`));
    const result = await login(undefined, form("ana@x.com", "senha-correta-1"));
    expect(result?.error).toMatch(/Muitas tentativas/);
    expect(createSession).not.toHaveBeenCalled();
  });
});
