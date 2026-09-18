/** @jest-environment node */
// Leitura clínica: `clinico:ler` é exigido na própria query, sem depender da página.
const currentUser = { current: null as null | { role: string; active: boolean } };

jest.mock("@/modules/auth/dal", () => {
  const { can } = jest.requireActual("@/modules/auth/permissions");
  class RedirectSignal extends Error {
    constructor(public url: string) {
      super("NEXT_REDIRECT");
    }
  }
  return {
    RedirectSignal,
    // Espelha dal.ts: sem sessão (ou usuário inativo, cuja sessão é descartada) → /login;
    // sem permissão → /acesso-negado.
    requirePermission: jest.fn(async (permission: string) => {
      const user = currentUser.current;
      if (!user || !user.active) throw new RedirectSignal("/login");
      if (!can(user.role, permission)) throw new RedirectSignal("/acesso-negado");
      return { id: "u1", name: "U", email: "u@example.com", role: user.role };
    }),
  };
});

const prismaMock = { anamnesis: { findFirst: jest.fn(), findMany: jest.fn() } };
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

import {
  ANAMNESIS_HISTORY_SELECT,
  getAnamnesisVersion,
  getCurrentAnamnesis,
  listAnamnesisVersions,
} from "../queries";

function as(role: string | null, active = true) {
  currentUser.current = role ? { role, active } : null;
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.anamnesis.findFirst.mockResolvedValue(null);
  prismaMock.anamnesis.findMany.mockResolvedValue([]);
});

const calls = [
  ["getCurrentAnamnesis", () => getCurrentAnamnesis("p1")],
  ["getAnamnesisVersion", () => getAnamnesisVersion("p1", "a1")],
  ["listAnamnesisVersions", () => listAnamnesisVersions("p1")],
] as const;

describe.each(calls)("%s", (_name, call) => {
  it.each(["ADMIN", "FISIOTERAPEUTA"])("permite %s", async (role) => {
    as(role);
    await expect(call()).resolves.toBeDefined();
  });

  it("bloqueia RECEPCAO em chamada direta, sem consultar o banco", async () => {
    as("RECEPCAO");
    await expect(call()).rejects.toMatchObject({ url: "/acesso-negado" });
    expect(prismaMock.anamnesis.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.anamnesis.findMany).not.toHaveBeenCalled();
  });

  it("bloqueia usuário inativo e sem sessão", async () => {
    as("FISIOTERAPEUTA", false);
    await expect(call()).rejects.toMatchObject({ url: "/login" });
    as(null);
    await expect(call()).rejects.toMatchObject({ url: "/login" });
    expect(prismaMock.anamnesis.findFirst).not.toHaveBeenCalled();
  });
});

describe("filtros e ordenação", () => {
  beforeEach(() => as("FISIOTERAPEUTA"));

  it("versão vigente: maior createdAt com desempate pelo maior id", async () => {
    await getCurrentAnamnesis("p1");
    expect(prismaMock.anamnesis.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientId: "p1" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("histórico usa a mesma ordenação e não carrega conteúdo clínico", async () => {
    await listAnamnesisVersions("p1");
    const args = prismaMock.anamnesis.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ patientId: "p1" });
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(Object.keys(ANAMNESIS_HISTORY_SELECT).sort()).toEqual(
      ["assessmentDate", "authorNameSnapshot", "createdAt", "id"].sort(),
    );
  });

  it("versão específica é sempre filtrada pelo paciente da URL (sem enumeração cruzada)", async () => {
    await getAnamnesisVersion("p1", "a9");
    expect(prismaMock.anamnesis.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "a9", patientId: "p1" } }),
    );
  });

  it("ids implausíveis retornam vazio sem consultar o banco", async () => {
    await expect(getCurrentAnamnesis("../x")).resolves.toBeNull();
    await expect(getAnamnesisVersion("p1", "")).resolves.toBeNull();
    await expect(listAnamnesisVersions("a".repeat(80))).resolves.toEqual([]);
    expect(prismaMock.anamnesis.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.anamnesis.findMany).not.toHaveBeenCalled();
  });
});
