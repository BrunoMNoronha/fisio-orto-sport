/** @jest-environment node */
// Leitura dos planos: `clinico:ler` na própria query e escopo sempre pelo paciente da URL.
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
  therapyPlan: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  therapyPlanRevision: { findFirst: jest.fn(), findMany: jest.fn() },
  therapyPlanStatusChange: { findMany: jest.fn() },
  assessment: { findMany: jest.fn() },
  $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

import {
  getPlan,
  getPlanRevision,
  listPlanOriginOptions,
  listPlanRevisions,
  listPlanStatusChanges,
  listPlans,
} from "../plan-queries";

function as(role: string | null, active = true) {
  currentUser.current = role ? { role, active } : null;
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.therapyPlan.findMany.mockResolvedValue([]);
  prismaMock.therapyPlan.findFirst.mockResolvedValue(null);
  prismaMock.therapyPlan.count.mockResolvedValue(0);
  prismaMock.therapyPlanRevision.findFirst.mockResolvedValue(null);
  prismaMock.therapyPlanRevision.findMany.mockResolvedValue([]);
  prismaMock.therapyPlanStatusChange.findMany.mockResolvedValue([]);
  prismaMock.assessment.findMany.mockResolvedValue([]);
});

const reads = [
  ["listPlans", () => listPlans("p1", 1)],
  ["getPlan", () => getPlan("p1", "pl1")],
  ["getPlanRevision", () => getPlanRevision("p1", "pl1", 1)],
  ["listPlanRevisions", () => listPlanRevisions("p1", "pl1")],
  ["listPlanStatusChanges", () => listPlanStatusChanges("p1", "pl1")],
  ["listPlanOriginOptions", () => listPlanOriginOptions("p1")],
] as const;

describe("autorização", () => {
  it.each(reads)("%s: Recepção é bloqueada antes do banco", async (_name, call) => {
    as("RECEPCAO");
    await expect(call()).rejects.toMatchObject({ url: "/acesso-negado" });
    for (const model of [prismaMock.therapyPlan, prismaMock.therapyPlanRevision, prismaMock.therapyPlanStatusChange]) {
      for (const fn of Object.values(model)) expect(fn).not.toHaveBeenCalled();
    }
  });

  it.each(reads)("%s: usuário inativo vai para o login", async (_name, call) => {
    as("ADMIN", false);
    await expect(call()).rejects.toMatchObject({ url: "/login" });
  });
});

describe("escopo e ordem", () => {
  beforeEach(() => as("FISIOTERAPEUTA"));

  it("lista paginada (10) em ordem estável, só com metadados", async () => {
    prismaMock.therapyPlan.count.mockResolvedValue(11);
    const result = await listPlans("p1", 2);
    const args = prismaMock.therapyPlan.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ where: { patientId: "p1" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: 10, take: 10 });
    expect(args.select.revisions.select).toEqual({ planDate: true });
    expect(result).toMatchObject({ total: 11, pageCount: 2 });
  });

  it("plano, revisões e mudanças de estado sempre filtradas pelo paciente", async () => {
    await getPlan("p1", "pl1");
    expect(prismaMock.therapyPlan.findFirst.mock.calls[0][0].where).toEqual({ id: "pl1", patientId: "p1" });
    await getPlanRevision("p1", "pl1", 2);
    expect(prismaMock.therapyPlanRevision.findFirst.mock.calls[0][0].where).toEqual({
      planId: "pl1",
      number: 2,
      plan: { patientId: "p1" },
    });
    await listPlanRevisions("p1", "pl1");
    expect(prismaMock.therapyPlanRevision.findMany.mock.calls[0][0]).toMatchObject({
      where: { planId: "pl1", plan: { patientId: "p1" } },
      orderBy: { number: "desc" },
    });
    await listPlanStatusChanges("p1", "pl1");
    expect(prismaMock.therapyPlanStatusChange.findMany.mock.calls[0][0].where).toEqual({
      planId: "pl1",
      plan: { patientId: "p1" },
    });
  });

  it("getPlan devolve a revisão vigente separada", async () => {
    prismaMock.therapyPlan.findFirst.mockResolvedValue({ id: "pl1", currentRevision: 2, revisions: [{ number: 2 }] });
    expect(await getPlan("p1", "pl1")).toMatchObject({ id: "pl1", current: { number: 2 } });
  });

  it("ids e números implausíveis não consultam", async () => {
    expect(await getPlan("p1", "../x")).toBeNull();
    expect(await getPlanRevision("p1", "pl1", 0)).toBeNull();
    expect(await listPlanRevisions("a b", "pl1")).toEqual([]);
    expect(prismaMock.therapyPlan.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.therapyPlanRevision.findFirst).not.toHaveBeenCalled();
  });

  it("opções de origem exigem clinico:gerir e trazem só avaliações do paciente", async () => {
    await listPlanOriginOptions("p1");
    expect(prismaMock.assessment.findMany.mock.calls[0][0].where).toEqual({ patientId: "p1" });
  });
});
