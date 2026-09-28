/** @jest-environment node */
// Chamada direta da Server Action: ambiente, sessão e perfil são checados no servidor antes de gravar.
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
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/modules/auditoria/record", () => ({ requestIp: jest.fn(async () => "10.0.0.9") }));

const generate = jest.fn();
jest.mock("../generate", () => {
  const actual = jest.requireActual("../generate");
  return { ...actual, generateDevData: (...args: unknown[]) => generate(...args) };
});

import { assertPermission } from "@/modules/auth/dal";
import { populateDevData } from "../actions";
import { DevDataError } from "../generate";

const admin = { id: "u-admin", name: "Admin", email: "a@x.test", role: "ADMIN" };
const counts = {
  patients: 4,
  appointments: 10,
  anamneses: 3,
  assessments: 2,
  therapyPlans: 2,
  planRevisions: 2,
  treatmentSessions: 4,
  reassessments: 1,
};
const env = process.env as Record<string, string | undefined>;
const ORIGINAL = { ...env };

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  currentUser.current = admin;
  setEnv({
    NODE_ENV: "development",
    VERCEL: undefined,
    DEMO_DATA_TARGET: "localhost/fisio_dev",
    DATABASE_URL: "postgresql://u:segredo@localhost:5432/fisio_dev",
  });
  generate.mockResolvedValue({ created: true, counts, reference: "2026-09-27" });
});

afterAll(() => {
  for (const key of Object.keys(env)) delete env[key];
  Object.assign(env, ORIGINAL);
});

describe("populateDevData", () => {
  it.each([
    ["produção", { NODE_ENV: "production" }],
    ["Vercel", { VERCEL: "1" }],
    ["sem habilitação", { DEMO_DATA_TARGET: undefined }],
    ["alvo não permitido", { DEMO_DATA_TARGET: "localhost/outro" }],
    ["banco remoto", { DATABASE_URL: "postgresql://u:p@db.remoto.test/fisio_dev", DEMO_DATA_TARGET: "db.remoto.test/fisio_dev" }],
  ])("ambiente bloqueado (%s) não grava", async (_label, values) => {
    setEnv(values);
    expect(await populateDevData()).toEqual({ ok: false, error: "Indisponível neste ambiente." });
    expect(generate).not.toHaveBeenCalled();
    expect(assertPermission).not.toHaveBeenCalled();
  });

  it.each([
    ["sem sessão", null],
    ["Recepção", { ...admin, id: "u-r", role: "RECEPCAO" }],
    ["Fisioterapeuta", { ...admin, id: "u-f", role: "FISIOTERAPEUTA" }],
  ])("%s é recusado sem escrita", async (_label, user) => {
    currentUser.current = user;
    expect(await populateDevData()).toEqual({ ok: false, error: "Acesso negado." });
    expect(generate).not.toHaveBeenCalled();
  });

  it("Administrador gera no banco permitido, com autor e IP", async () => {
    expect(await populateDevData()).toEqual({ ok: true, created: true, counts, reference: "2026-09-27" });
    expect(generate).toHaveBeenCalledWith({}, { actorId: "u-admin", ip: "10.0.0.9", expectedDatabase: "fisio_dev" });
  });

  it("erro de regra vira mensagem; erro inesperado não vaza detalhes", async () => {
    generate.mockRejectedValueOnce(new DevDataError("Nenhum fisioterapeuta ativo com CREFITO cadastrado."));
    expect(await populateDevData()).toEqual({ ok: false, error: "Nenhum fisioterapeuta ativo com CREFITO cadastrado." });

    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    generate.mockRejectedValueOnce(new Error("connection postgresql://u:segredo@localhost"));
    const result = await populateDevData();
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/Nada foi gravado/) });
    expect(JSON.stringify(result)).not.toMatch(/segredo/);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/segredo/);
    spy.mockRestore();
  });
});
