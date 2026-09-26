/** @jest-environment node */
// Leitura das avaliações: `clinico:ler` na própria query e escopo sempre pelo paciente da URL.
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
  assessment: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  assessmentChange: { findMany: jest.fn() },
  $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

import {
  ASSESSMENT_DETAIL_SELECT,
  ASSESSMENT_LIST_SELECT,
  getAssessment,
  listAssessmentChanges,
  listAssessments,
} from "../assessment-queries";

function as(role: string | null, active = true) {
  currentUser.current = role ? { role, active } : null;
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.assessment.findMany.mockResolvedValue([]);
  prismaMock.assessment.findFirst.mockResolvedValue(null);
  prismaMock.assessment.count.mockResolvedValue(0);
  prismaMock.assessmentChange.findMany.mockResolvedValue([]);
});

const calls = [
  ["listAssessments", () => listAssessments("p1", 1)],
  ["getAssessment", () => getAssessment("p1", "av1")],
  ["listAssessmentChanges", () => listAssessmentChanges("p1", "av1")],
] as const;

describe("autorização", () => {
  it.each(calls)("%s: Recepção é bloqueada antes do banco", async (_name, call) => {
    as("RECEPCAO");
    await expect(call()).rejects.toMatchObject({ url: "/acesso-negado" });
    expect(prismaMock.assessment.findMany).not.toHaveBeenCalled();
    expect(prismaMock.assessment.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.assessmentChange.findMany).not.toHaveBeenCalled();
  });

  it.each(calls)("%s: sessão inválida ou usuário inativo vai para o login", async (_name, call) => {
    as("FISIOTERAPEUTA", false);
    await expect(call()).rejects.toMatchObject({ url: "/login" });
  });
});

describe("listAssessments", () => {
  beforeEach(() => as("FISIOTERAPEUTA"));

  it("pagina (10 por página) em ordem estável: data clínica, registro e id, todos decrescentes", async () => {
    prismaMock.assessment.count.mockResolvedValue(23);
    const result = await listAssessments("p1", 3);
    expect(prismaMock.assessment.findMany).toHaveBeenCalledWith({
      where: { patientId: "p1" },
      orderBy: [{ assessmentDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: 20,
      take: 10,
      select: ASSESSMENT_LIST_SELECT,
    });
    expect(result).toMatchObject({ total: 23, page: 3, pageCount: 3 });
  });

  it("a listagem traz só metadados, sem conteúdo clínico", () => {
    for (const field of ["diagnosis", "inspection", "rangeOfMotion", "therapeuticGoals", "clinicalNotes"]) {
      expect(ASSESSMENT_LIST_SELECT).not.toHaveProperty(field);
    }
  });

  it("paciente implausível devolve lista vazia sem consultar", async () => {
    expect(await listAssessments("../x", 1)).toMatchObject({ items: [], total: 0, pageCount: 1 });
    expect(prismaMock.assessment.findMany).not.toHaveBeenCalled();
  });
});

describe("getAssessment e listAssessmentChanges", () => {
  beforeEach(() => as("ADMIN"));

  it("filtram pelo paciente da URL (id trocado não vaza)", async () => {
    await getAssessment("p1", "av1");
    expect(prismaMock.assessment.findFirst).toHaveBeenCalledWith({
      where: { id: "av1", patientId: "p1" },
      select: ASSESSMENT_DETAIL_SELECT,
    });
    await listAssessmentChanges("p1", "av1");
    expect(prismaMock.assessmentChange.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { assessmentId: "av1", assessment: { patientId: "p1" } } }),
    );
  });

  it("ids implausíveis não consultam o banco", async () => {
    expect(await getAssessment("p1", "x".repeat(65))).toBeNull();
    expect(await listAssessmentChanges("p1", "a b")).toEqual([]);
    expect(prismaMock.assessment.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.assessmentChange.findMany).not.toHaveBeenCalled();
  });
});
