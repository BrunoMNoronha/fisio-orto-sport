/** @jest-environment node */
const currentRole = { current: null as string | null };

jest.mock("@/modules/auth/dal", () => {
  const { can } = jest.requireActual("@/modules/auth/permissions");
  class AccessDenied extends Error {}
  return {
    AccessDenied,
    requirePermission: jest.fn(async (permission: string) => {
      if (!currentRole.current || !can(currentRole.current, permission)) throw new AccessDenied("redirect");
      return { id: "u1", name: "U", email: "u@example.com", role: currentRole.current };
    }),
  };
});

const prismaMock = {
  patient: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
  $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

import { PATIENT_DETAIL_SELECT, PATIENT_LIST_SELECT, getPatient, listPatients } from "../queries";

const ALLOWED_FIELDS = [
  "id",
  "fullName",
  "birthDate",
  "sex",
  "occupation",
  "cpf",
  "phone",
  "email",
  "address",
  "status",
  "notes",
  "guardianName",
  "guardianPhone",
  "guardianRelationship",
  "createdAt",
  "updatedAt",
];

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.patient.findMany.mockResolvedValue([]);
  prismaMock.patient.count.mockResolvedValue(0);
  prismaMock.patient.findUnique.mockResolvedValue(null);
});

describe("autorização", () => {
  it.each(["ADMIN", "RECEPCAO", "FISIOTERAPEUTA"])("%s lista e consulta", async (role) => {
    currentRole.current = role;
    await expect(listPatients({ page: 1 })).resolves.toBeDefined();
    await expect(getPatient("p1")).resolves.toBeNull();
  });

  it("sem sessão não chega ao banco", async () => {
    currentRole.current = null;
    await expect(listPatients({ page: 1 })).rejects.toThrow();
    await expect(getPatient("p1")).rejects.toThrow();
    expect(prismaMock.patient.findMany).not.toHaveBeenCalled();
    expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
  });
});

describe("listPatients", () => {
  beforeEach(() => {
    currentRole.current = "FISIOTERAPEUTA";
  });

  it("pagina por offset (20 por página) e ordena por nome", async () => {
    prismaMock.patient.count.mockResolvedValue(45);
    const result = await listPatients({ page: 3 });
    expect(prismaMock.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 40, take: 20, orderBy: [{ fullName: "asc" }, { id: "asc" }], where: {} }),
    );
    expect(result).toMatchObject({ total: 45, page: 3, pageSize: 20, pageCount: 3 });
  });

  it("lista vazia tem uma página", async () => {
    expect((await listPatients({ page: 1 })).pageCount).toBe(1);
  });

  it("filtra por nome (sem diferenciar acentos nem maiúsculas) e por situação", async () => {
    await listPatients({ q: "Paginação", status: "INATIVO", page: 1 });
    const where = { searchName: { contains: "paginacao" }, status: "INATIVO" };
    expect(prismaMock.patient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(prismaMock.patient.count).toHaveBeenCalledWith({ where });
  });

  it("usa select explícito, sem include nem CPF na listagem", async () => {
    await listPatients({ page: 1 });
    const args = prismaMock.patient.findMany.mock.calls[0][0];
    expect(args.select).toBe(PATIENT_LIST_SELECT);
    expect(args).not.toHaveProperty("include");
    expect(PATIENT_LIST_SELECT).not.toHaveProperty("cpf");
  });
});

describe("getPatient", () => {
  beforeEach(() => {
    currentRole.current = "RECEPCAO";
  });

  it("consulta por id com select explícito", async () => {
    await getPatient("p1");
    expect(prismaMock.patient.findUnique).toHaveBeenCalledWith({ where: { id: "p1" }, select: PATIENT_DETAIL_SELECT });
  });

  it("id inválido não consulta o banco", async () => {
    expect(await getPatient("x".repeat(65))).toBeNull();
    expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
  });
});

describe("cadastro complementar (Fase 2c)", () => {
  it("a ficha traz sexo e profissão; a listagem não", () => {
    expect(PATIENT_DETAIL_SELECT).toMatchObject({ sex: true, occupation: true });
    expect(PATIENT_LIST_SELECT).not.toHaveProperty("sex");
    expect(PATIENT_LIST_SELECT).not.toHaveProperty("occupation");
  });
});

describe("sem dados clínicos", () => {
  it("as seleções só contêm campos cadastrais", () => {
    for (const select of [PATIENT_LIST_SELECT, PATIENT_DETAIL_SELECT]) {
      for (const key of Object.keys(select)) expect(ALLOWED_FIELDS).toContain(key);
    }
  });

  it("nunca incluem a relação de anamneses", () => {
    for (const select of [PATIENT_LIST_SELECT, PATIENT_DETAIL_SELECT]) {
      expect(select).not.toHaveProperty("anamneses");
    }
  });
});
