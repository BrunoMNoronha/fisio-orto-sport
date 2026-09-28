/** @jest-environment node */
// Limpeza pela web (#78): ambiente, sessão, perfil e confirmação são checados no servidor antes de
// qualquer escrita; a exceção da auditoria nunca é passada; sucesso remove o cookie e vai ao login.
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

jest.mock("@/lib/db", () => ({ prisma: {} }));
jest.mock("@/modules/auditoria/record", () => ({ requestIp: jest.fn(async () => "10.0.0.9") }));
const deleteCookie = jest.fn();
jest.mock("next/headers", () => ({ cookies: jest.fn(async () => ({ delete: deleteCookie })) }));
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

const execute = jest.fn();
jest.mock("../reset", () => {
  const actual = jest.requireActual("../reset");
  return { ...actual, executeReset: (...args: unknown[]) => execute(...args) };
});

import { resetDevDatabase } from "../actions";
import { ResetAbort } from "../reset";

const admin = { id: "u-admin", name: "ADMIN", email: "a@x.test", role: "ADMIN" };
const env = process.env as Record<string, string | undefined>;
const ORIGINAL = { ...env };

function form(database: string, word: string) {
  const fd = new FormData();
  fd.set("database", database);
  fd.set("word", word);
  return fd;
}

beforeEach(() => {
  jest.clearAllMocks();
  currentUser.current = admin;
  Object.assign(env, {
    NODE_ENV: "development",
    DEV_RESET_TARGET: "localhost/fisio_dev",
    DATABASE_URL: "postgresql://u:segredo@localhost:5432/fisio_dev",
  });
  delete env.VERCEL;
  execute.mockResolvedValue({ users: 3, cleared: {}, before: {} });
});

afterAll(() => {
  for (const key of Object.keys(env)) delete env[key];
  Object.assign(env, ORIGINAL);
});

describe("resetDevDatabase", () => {
  it.each([
    ["produção", { NODE_ENV: "production" }],
    ["Vercel", { VERCEL: "1" }],
    ["sem habilitação", { DEV_RESET_TARGET: undefined }],
    ["alvo não permitido", { DEV_RESET_TARGET: "localhost/outro" }],
  ])("ambiente bloqueado (%s) não grava", async (_label, values) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
    expect(await resetDevDatabase(undefined, form("fisio_dev", "LIMPAR"))).toEqual({ error: "Indisponível neste ambiente." });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["sem sessão", null],
    ["Recepção", { ...admin, role: "RECEPCAO" }],
    ["Fisioterapeuta", { ...admin, role: "FISIOTERAPEUTA" }],
  ])("%s é recusado sem escrita", async (_label, user) => {
    currentUser.current = user;
    expect(await resetDevDatabase(undefined, form("fisio_dev", "LIMPAR"))).toEqual({ error: "Acesso negado." });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["banco errado", "outro", "LIMPAR"],
    ["palavra errada", "fisio_dev", "limpar"],
    ["vazio", "", ""],
  ])("confirmação incorreta (%s) não grava", async (_label, database, word) => {
    const result = await resetDevDatabase(undefined, form(database, word));
    expect(result?.error).toMatch(/^Confirmação incorreta/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("confirmado: executa sem a exceção da auditoria, remove o cookie e vai ao login", async () => {
    await expect(resetDevDatabase(undefined, form("fisio_dev", "LIMPAR"))).rejects.toMatchObject({
      url: "/login?base=limpa",
    });
    expect(execute).toHaveBeenCalledWith(
      {},
      { expectedDatabase: "fisio_dev", actor: { id: "u-admin", role: "ADMIN", ip: "10.0.0.9" } },
    );
    expect(JSON.stringify(execute.mock.calls)).not.toMatch(/includeAudit/);
    expect(deleteCookie).toHaveBeenCalled();
  });

  it("falha desfaz tudo e não redireciona nem vaza detalhes", async () => {
    execute.mockRejectedValueOnce(new ResetAbort("Os usuários mudaram durante a operação."));
    expect(await resetDevDatabase(undefined, form("fisio_dev", "LIMPAR"))).toEqual({
      error: "Os usuários mudaram durante a operação. A transação foi desfeita; nada foi alterado.",
    });
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    execute.mockRejectedValueOnce(new Error("postgresql://u:segredo@localhost"));
    const result = await resetDevDatabase(undefined, form("fisio_dev", "LIMPAR"));
    expect(JSON.stringify(result)).not.toMatch(/segredo/);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/segredo/);
    expect(deleteCookie).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
