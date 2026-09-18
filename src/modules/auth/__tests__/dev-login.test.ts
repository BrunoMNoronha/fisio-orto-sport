/** @jest-environment node */
const findUnique = jest.fn();
const findMany = jest.fn();
jest.mock("@/lib/db", () => ({
  get prisma() {
    return { user: { findUnique, findMany } };
  },
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
const createSession = jest.fn();
jest.mock("../session", () => ({
  createSession: (...args: unknown[]) => createSession(...args),
  deleteSession: jest.fn(),
}));

import { devLogin, listDevUsers } from "../dev-login";

const env = process.env as Record<string, string | undefined>;
const originalEnv = env.NODE_ENV;

function form(userId: string, next = "/") {
  const fd = new FormData();
  fd.set("userId", userId);
  fd.set("next", next);
  return fd;
}

beforeEach(() => {
  jest.clearAllMocks();
  env.NODE_ENV = "development";
  findUnique.mockResolvedValue({ id: "u1", passwordHash: "h", active: true });
  findMany.mockResolvedValue([{ id: "u1" }]);
  createSession.mockResolvedValue(true);
});
afterAll(() => {
  env.NODE_ENV = originalEnv;
});

describe("devLogin", () => {
  it("fora de dev não lista nem cria sessão", async () => {
    env.NODE_ENV = "production";
    await expect(listDevUsers()).resolves.toEqual([]);
    await expect(devLogin(form("u1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(findMany).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("em dev cria sessão e redireciona só para caminho interno", async () => {
    await expect(devLogin(form("u1", "//evil.com"))).rejects.toThrow("NEXT_REDIRECT:/");
    expect(createSession).toHaveBeenCalledWith("u1", "h");
  });

  it("usuário inativo ou inexistente não loga", async () => {
    findUnique.mockResolvedValueOnce({ id: "u1", passwordHash: "h", active: false });
    await expect(devLogin(form("u1"))).rejects.toThrow("NEXT_REDIRECT:/login");
    findUnique.mockResolvedValueOnce(null);
    await expect(devLogin(form("x"))).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(createSession).not.toHaveBeenCalled();
  });
});
