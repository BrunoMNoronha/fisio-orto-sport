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
let requestHeaders = new Headers({ "x-forwarded-for": "10.0.0.1" });
jest.mock("next/headers", () => ({
  headers: async () => requestHeaders,
}));
// Mesmos limites de produção, com armazenamento em memória (o PostgreSQL é coberto na integração).
jest.mock("../limits", () => {
  const { MemoryRateLimitStore, RATE_LIMIT_WINDOW_MS, RateLimiter } = jest.requireActual("../rate-limit");
  const store = new MemoryRateLimitStore();
  return {
    store,
    loginAttemptsByEmail: new RateLimiter("login-email", 5, RATE_LIMIT_WINDOW_MS, store),
    loginAttemptsByIp: new RateLimiter("login-ip", 30, RATE_LIMIT_WINDOW_MS, store),
    setupAttemptsByIp: new RateLimiter("setup-ip", 10, RATE_LIMIT_WINDOW_MS, store),
  };
});
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
import { loginAttemptsByEmail, loginAttemptsByIp } from "../limits";

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

beforeEach(async () => {
  jest.clearAllMocks();
  process.env.VERCEL = "1";
  requestHeaders = new Headers({ "x-forwarded-for": "10.0.0.1" });
  await loginAttemptsByIp.reset("10.0.0.1");
  await loginAttemptsByEmail.reset("ana@x.com");
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

  it("bloqueio por e-mail tem a mesma resposta para conta existente ou não", async () => {
    findUnique.mockResolvedValue(null);
    for (let i = 0; i < 5; i++) await login(undefined, form("nao-existe@x.com", `errada-${i}`));
    const inexistente = await login(undefined, form("nao-existe@x.com", "qualquer-1"));
    findUnique.mockResolvedValue({ id: "u1", passwordHash: hash, active: true });
    for (let i = 0; i < 5; i++) await login(undefined, form("ana@x.com", `errada-${i}`));
    const existente = await login(undefined, form("ana@x.com", "qualquer-1"));
    expect(inexistente?.error).toBe(existente?.error);
    await loginAttemptsByEmail.reset("nao-existe@x.com");
  });

  it("login bem-sucedido zera as tentativas do e-mail", async () => {
    for (let i = 0; i < 4; i++) await login(undefined, form("ana@x.com", `errada-${i}`));
    await expect(login(undefined, form("ana@x.com", "senha-correta-1"))).rejects.toThrow("NEXT_REDIRECT");
    for (let i = 0; i < 4; i++) await login(undefined, form("ana@x.com", `errada-${i}`));
    await expect(login(undefined, form("ana@x.com", "senha-correta-1"))).rejects.toThrow("NEXT_REDIRECT");
  });

  it("limita 30 tentativas por IP confiável, contadas antes da validação", async () => {
    for (let i = 0; i < 30; i++) await login(undefined, form(`invalido-${i}`, ""));
    const result = await login(undefined, form("ana@x.com", "senha-correta-1"));
    expect(result?.error).toMatch(/Muitas tentativas/);
    expect(findUnique).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("sem proxy confiável ignora x-forwarded-for e não aplica o limite por IP", async () => {
    delete process.env.VERCEL;
    for (let i = 0; i < 31; i++) await login(undefined, form(`invalido-${i}`, ""));
    await expect(login(undefined, form("ana@x.com", "senha-correta-1"))).rejects.toThrow("NEXT_REDIRECT");
  });
});
