/** @jest-environment node */
const currentRole = { current: null as string | null };

jest.mock("@/modules/auth/dal", () => {
  const { can } = jest.requireActual("@/modules/auth/permissions");
  class AccessDenied extends Error {}
  return {
    AccessDenied,
    // Sem sessão (anônimo ou inativo) ou sem permissão: redireciona antes de consultar.
    requirePermission: jest.fn(async (permission: string) => {
      if (!currentRole.current || !can(currentRole.current, permission)) throw new AccessDenied("redirect");
      return { id: "u1", name: "U", email: "u@example.com", role: currentRole.current };
    }),
  };
});

const prismaMock = {
  charge: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
  patient: { findUnique: jest.fn() },
  $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

import {
  CHARGE_DETAIL_SELECT,
  CHARGE_LIST_SELECT,
  getCharge,
  getChargePatientFilter,
  getChargePatientOption,
  listCharges,
} from "../queries";

// Nenhuma relação clínica nem dado cadastral além de id, nome e situação do paciente.
const CLINICAL = ["anamneses", "assessments", "therapyPlans", "treatmentSessions", "reassessments", "appointments"];

function keysDeep(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...keysDeep(nested)]);
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.charge.findMany.mockResolvedValue([]);
  prismaMock.charge.count.mockResolvedValue(0);
  prismaMock.charge.findUnique.mockResolvedValue(null);
  prismaMock.patient.findUnique.mockResolvedValue(null);
});

describe("autorização", () => {
  it.each(["ADMIN", "RECEPCAO", "FISIOTERAPEUTA"])("%s lista, consulta e pré-seleciona com alcance igual", async (role) => {
    currentRole.current = role;
    await expect(listCharges({ page: 1 })).resolves.toBeDefined();
    await expect(getCharge("c1")).resolves.toBeNull();
    await expect(getChargePatientFilter("p1")).resolves.toBeNull();
    await expect(getChargePatientOption("p1")).resolves.toBeNull();
    // Sem filtro por autor ou profissional: todos os pacientes.
    expect(prismaMock.charge.findMany.mock.calls[0][0].where).toEqual({});
  });

  it("sem sessão não chega ao banco", async () => {
    currentRole.current = null;
    await expect(listCharges({ page: 1 })).rejects.toThrow();
    await expect(getCharge("c1")).rejects.toThrow();
    await expect(getChargePatientOption("p1")).rejects.toThrow();
    expect(prismaMock.charge.findMany).not.toHaveBeenCalled();
    expect(prismaMock.charge.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
  });
});

describe("seleções", () => {
  it("não carregam conteúdo clínico", () => {
    for (const select of [CHARGE_LIST_SELECT, CHARGE_DETAIL_SELECT]) {
      const keys = keysDeep(select);
      for (const clinical of CLINICAL) expect(keys).not.toContain(clinical);
      expect(select.patient).toEqual({ select: { id: true, fullName: true, status: true } });
    }
  });
});

describe("listCharges", () => {
  beforeEach(() => {
    currentRole.current = "RECEPCAO";
  });

  it("pagina de 20 em 20 em ordem estável e devolve o total do filtro", async () => {
    prismaMock.charge.count.mockResolvedValue(45);
    const result = await listCharges({ page: 3 });
    expect(prismaMock.charge.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: 40,
      take: 20,
      select: CHARGE_LIST_SELECT,
    });
    expect(result).toMatchObject({ total: 45, page: 3, pageCount: 3 });
  });

  it("filtra por situação, paciente e nome do paciente sem acentos", async () => {
    await listCharges({ page: 1, status: "CANCELADA", patientId: "p1", q: "José" });
    const where = { status: "CANCELADA", patientId: "p1", patient: { searchName: { contains: "jose" } } };
    expect(prismaMock.charge.findMany.mock.calls[0][0].where).toEqual(where);
    expect(prismaMock.charge.count).toHaveBeenCalledWith({ where });
  });

  it("id implausível não consulta", async () => {
    expect(await getCharge("a b")).toBeNull();
    expect(prismaMock.charge.findUnique).not.toHaveBeenCalled();
  });

  it("pré-seleção sinaliza paciente inativo", async () => {
    prismaMock.patient.findUnique.mockResolvedValue({ id: "p1", fullName: "ANA", status: "INATIVO" });
    expect(await getChargePatientOption("p1")).toEqual({ id: "p1", label: "ANA (inativo)" });
  });
});
