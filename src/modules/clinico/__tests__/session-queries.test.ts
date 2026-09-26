/** @jest-environment node */
// Leitura de atendimentos: `clinico:ler` (ou `gerir` para opções do formulário) e escopo pelo paciente.
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
    requirePermission: jest.fn(async (permission: string) => {
      const user = currentUser.current;
      if (!user || !user.active) throw new RedirectSignal("/login");
      if (!can(user.role, permission)) throw new RedirectSignal("/acesso-negado");
      return { id: "u1", name: "U", email: "u@example.com", role: user.role };
    }),
  };
});

const prismaMock = {
  treatmentSession: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  treatmentSessionChange: { findMany: jest.fn() },
  therapyPlan: { findMany: jest.fn() },
  user: { findMany: jest.fn() },
  $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

import {
  countValidSessions,
  getSession,
  listProfessionalOptions,
  listSessionChanges,
  listSessionPlanOptions,
  listSessions,
} from "../session-queries";

function as(role: string | null, active = true) {
  currentUser.current = role ? { role, active } : null;
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.treatmentSession.findMany.mockResolvedValue([]);
  prismaMock.treatmentSession.findFirst.mockResolvedValue(null);
  prismaMock.treatmentSession.count.mockResolvedValue(0);
  prismaMock.treatmentSessionChange.findMany.mockResolvedValue([]);
  prismaMock.therapyPlan.findMany.mockResolvedValue([]);
  prismaMock.user.findMany.mockResolvedValue([]);
});

const reads = [
  ["listSessions", () => listSessions("p1", 1)],
  ["getSession", () => getSession("p1", "s1")],
  ["listSessionChanges", () => listSessionChanges("p1", "s1")],
  ["countValidSessions", () => countValidSessions("p1", "pl1")],
  ["listSessionPlanOptions", () => listSessionPlanOptions("p1")],
  ["listProfessionalOptions", () => listProfessionalOptions()],
] as const;

describe("autorização", () => {
  it.each(reads)("%s: Recepção é bloqueada antes do banco", async (_name, call) => {
    as("RECEPCAO");
    await expect(call()).rejects.toMatchObject({ url: "/acesso-negado" });
    for (const model of [prismaMock.treatmentSession, prismaMock.treatmentSessionChange, prismaMock.therapyPlan, prismaMock.user]) {
      for (const fn of Object.values(model)) expect(fn).not.toHaveBeenCalled();
    }
  });

  it.each(reads)("%s: usuário inativo vai para o login", async (_name, call) => {
    as("FISIOTERAPEUTA", false);
    await expect(call()).rejects.toMatchObject({ url: "/login" });
  });
});

describe("escopo, ordem e contagem", () => {
  beforeEach(() => as("FISIOTERAPEUTA"));

  it("histórico paginado (10) em ordem cronológica estável", async () => {
    prismaMock.treatmentSession.count.mockResolvedValue(21);
    const result = await listSessions("p1", 3);
    expect(prismaMock.treatmentSession.findMany.mock.calls[0][0]).toMatchObject({
      where: { patientId: "p1" },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: 20,
      take: 10,
    });
    expect(result).toMatchObject({ total: 21, pageCount: 3 });
  });

  it("detalhe e histórico filtrados pelo paciente; detalhe traz a revisão exata aplicada", async () => {
    await getSession("p1", "s1");
    const args = prismaMock.treatmentSession.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: "s1", patientId: "p1" });
    expect(args.select.planRevision).toBeDefined();
    await listSessionChanges("p1", "s1");
    expect(prismaMock.treatmentSessionChange.findMany.mock.calls[0][0].where).toEqual({ sessionId: "s1", session: { patientId: "p1" } });
  });

  it("contagem só de atendimentos VÁLIDOS do plano (correções e invalidados não somam)", async () => {
    prismaMock.treatmentSession.count.mockResolvedValue(4);
    expect(await countValidSessions("p1", "pl1")).toBe(4);
    expect(prismaMock.treatmentSession.count).toHaveBeenCalledWith({ where: { patientId: "p1", planId: "pl1", status: "VALIDO" } });
  });

  it("opções: só planos ATIVOS do paciente; profissionais só FISIOTERAPEUTA (inativos incluídos)", async () => {
    prismaMock.therapyPlan.findMany.mockResolvedValue([{ id: "pl1", currentRevision: 1, revisions: [], _count: { treatmentSessions: 3 } }]);
    expect(await listSessionPlanOptions("p1")).toEqual([{ id: "pl1", currentRevision: 1, revisions: [], validSessions: 3 }]);
    expect(prismaMock.therapyPlan.findMany.mock.calls[0][0].where).toEqual({ patientId: "p1", status: "ATIVO" });
    await listProfessionalOptions();
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual({ role: "FISIOTERAPEUTA" });
  });

  it("ids implausíveis não consultam", async () => {
    expect(await getSession("p1", "../x")).toBeNull();
    expect(await countValidSessions("p1", "a b")).toBe(0);
    expect(prismaMock.treatmentSession.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.treatmentSession.count).not.toHaveBeenCalled();
  });
});
