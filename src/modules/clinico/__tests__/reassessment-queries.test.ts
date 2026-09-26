/** @jest-environment node */
// Leitura de reavaliações: `clinico:ler` (ou `gerir` para opções) e escopo pelo paciente da URL.
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
  reassessment: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  reassessmentChange: { findMany: jest.fn() },
  therapyPlan: { findMany: jest.fn() },
  $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

import {
  getReassessment,
  listReassessmentChanges,
  listReassessmentPlanOptions,
  listReassessments,
} from "../reassessment-queries";

function as(role: string | null, active = true) {
  currentUser.current = role ? { role, active } : null;
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.reassessment.findMany.mockResolvedValue([]);
  prismaMock.reassessment.findFirst.mockResolvedValue(null);
  prismaMock.reassessment.count.mockResolvedValue(0);
  prismaMock.reassessmentChange.findMany.mockResolvedValue([]);
  prismaMock.therapyPlan.findMany.mockResolvedValue([]);
});

const reads = [
  ["listReassessments", () => listReassessments("p1", 1)],
  ["getReassessment", () => getReassessment("p1", "re1")],
  ["listReassessmentChanges", () => listReassessmentChanges("p1", "re1")],
  ["listReassessmentPlanOptions", () => listReassessmentPlanOptions("p1")],
] as const;

describe("autorização", () => {
  it.each(reads)("%s: Recepção é bloqueada antes do banco", async (_name, call) => {
    as("RECEPCAO");
    await expect(call()).rejects.toMatchObject({ url: "/acesso-negado" });
    for (const model of [prismaMock.reassessment, prismaMock.reassessmentChange, prismaMock.therapyPlan]) {
      for (const fn of Object.values(model)) expect(fn).not.toHaveBeenCalled();
    }
  });

  it.each(reads)("%s: usuário inativo vai para o login", async (_name, call) => {
    as("ADMIN", false);
    await expect(call()).rejects.toMatchObject({ url: "/login" });
  });
});

describe("escopo, ordem e pendência", () => {
  beforeEach(() => as("FISIOTERAPEUTA"));

  it("lista paginada em ordem estável, com a pendência de ajuste calculada", async () => {
    prismaMock.reassessment.count.mockResolvedValue(3);
    prismaMock.reassessment.findMany.mockResolvedValue([
      { id: "a", conclusion: "AJUSTE_PLANO", resultingRevision: null },
      { id: "b", conclusion: "AJUSTE_PLANO", resultingRevision: { number: 3 } },
      { id: "c", conclusion: "INDICACAO_ALTA", resultingRevision: null },
    ]);
    const result = await listReassessments("p1", 1);
    expect(prismaMock.reassessment.findMany.mock.calls[0][0]).toMatchObject({
      where: { patientId: "p1" },
      orderBy: [{ reassessmentDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: 10,
    });
    expect(result.items.map((item) => [item.id, item.adjustmentPending, item.resultingRevisionNumber])).toEqual([
      ["a", true, null],
      ["b", false, 3],
      ["c", false, null],
    ]);
  });

  it("detalhe filtrado pelo paciente e com a referência congelada", async () => {
    const snapshot = { assessment: { id: "av1" }, previous: null };
    prismaMock.reassessment.findFirst.mockResolvedValue({ id: "re1", conclusion: "CONTINUIDADE", resultingRevision: null, referenceSnapshot: snapshot });
    const result = await getReassessment("p1", "re1");
    expect(prismaMock.reassessment.findFirst.mock.calls[0][0].where).toEqual({ id: "re1", patientId: "p1" });
    expect(result).toMatchObject({ reference: snapshot, adjustmentPending: false });
    expect(result).not.toHaveProperty("referenceSnapshot");
  });

  it("histórico filtrado pelo paciente; opções só de planos ATIVOS", async () => {
    await listReassessmentChanges("p1", "re1");
    expect(prismaMock.reassessmentChange.findMany.mock.calls[0][0].where).toEqual({ reassessmentId: "re1", reassessment: { patientId: "p1" } });
    await listReassessmentPlanOptions("p1");
    expect(prismaMock.therapyPlan.findMany.mock.calls[0][0].where).toEqual({ patientId: "p1", status: "ATIVO" });
  });

  it("ids implausíveis não consultam", async () => {
    expect(await getReassessment("p1", "../x")).toBeNull();
    expect(await listReassessmentChanges("a b", "re1")).toEqual([]);
    expect(prismaMock.reassessment.findFirst).not.toHaveBeenCalled();
  });
});
