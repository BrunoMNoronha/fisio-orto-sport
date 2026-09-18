/** @jest-environment node */
import { hashToken } from "../session";

const cookieValue = { current: undefined as string | undefined };

jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "session" && cookieValue.current ? { value: cookieValue.current } : undefined),
  }),
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

const prismaMock = {
  session: { findUnique: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
};
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

// `cache` do React memoriza por renderização; nos testes cada chamada deve consultar de novo.
jest.mock("react", () => ({ ...jest.requireActual("react"), cache: <T,>(fn: T) => fn }));

import { AuthorizationError, assertPermission, getCurrentUser, requirePermission, requireRole, requireUser } from "../dal";

function sessionFor(role: string, overrides: { active?: boolean; expiresAt?: Date } = {}) {
  return {
    id: "s1",
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    user: { id: "u1", name: "Teste", email: "t@x.com", role, active: overrides.active ?? true },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  cookieValue.current = "token-valido";
});

describe("getCurrentUser", () => {
  it("retorna null sem cookie", async () => {
    cookieValue.current = undefined;
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
  });

  it("busca a sessão pelo hash do token, nunca pelo token puro", async () => {
    prismaMock.session.findUnique.mockResolvedValue(sessionFor("ADMIN"));
    await expect(getCurrentUser()).resolves.toMatchObject({ id: "u1", role: "ADMIN" });
    expect(prismaMock.session.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashToken("token-valido") } }),
    );
  });

  it("nega e invalida a sessão de usuário inativo", async () => {
    prismaMock.session.findUnique.mockResolvedValue(sessionFor("ADMIN", { active: false }));
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("nega e invalida a sessão expirada", async () => {
    prismaMock.session.findUnique.mockResolvedValue(sessionFor("ADMIN", { expiresAt: new Date(Date.now() - 1) }));
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(prismaMock.session.deleteMany).toHaveBeenCalled();
  });
});

describe("requireUser / requirePermission / requireRole", () => {
  it("redireciona o anônimo para /login", async () => {
    cookieValue.current = undefined;
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/login");
    await expect(requirePermission("usuarios:gerir")).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it.each(["RECEPCAO", "FISIOTERAPEUTA"])("nega usuarios:gerir para %s", async (role) => {
    prismaMock.session.findUnique.mockResolvedValue(sessionFor(role));
    await expect(requirePermission("usuarios:gerir")).rejects.toThrow("NEXT_REDIRECT:/acesso-negado");
    await expect(requireRole("ADMIN")).rejects.toThrow("NEXT_REDIRECT:/acesso-negado");
  });

  it("nega clinico:ler para RECEPCAO", async () => {
    prismaMock.session.findUnique.mockResolvedValue(sessionFor("RECEPCAO"));
    await expect(requirePermission("clinico:ler")).rejects.toThrow("NEXT_REDIRECT:/acesso-negado");
  });

  it("permite ao ADMIN", async () => {
    prismaMock.session.findUnique.mockResolvedValue(sessionFor("ADMIN"));
    await expect(requirePermission("usuarios:gerir")).resolves.toMatchObject({ role: "ADMIN" });
    await expect(requireRole("ADMIN")).resolves.toMatchObject({ role: "ADMIN" });
  });
});

describe("assertPermission", () => {
  it("lança AuthorizationError para perfil sem permissão e para anônimo", async () => {
    prismaMock.session.findUnique.mockResolvedValue(sessionFor("FISIOTERAPEUTA"));
    await expect(assertPermission("usuarios:gerir")).rejects.toBeInstanceOf(AuthorizationError);
    cookieValue.current = undefined;
    await expect(assertPermission("usuarios:gerir")).rejects.toBeInstanceOf(AuthorizationError);
  });
});
