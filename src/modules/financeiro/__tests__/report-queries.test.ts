/** @jest-environment node */
const currentUser = { role: null as string | null, active: true };
jest.mock("@/modules/auth/dal", () => {
  const { can } = jest.requireActual("@/modules/auth/permissions");
  return { requirePermission: jest.fn(async (permission: string) => {
    if (!currentUser.role || !currentUser.active || !can(currentUser.role, permission)) throw new Error("redirect");
    return { id: "u1", role: currentUser.role };
  }) };
});
const tx = { patient: { findUnique: jest.fn() }, $queryRaw: jest.fn() };
const prismaMock = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
jest.mock("@/lib/db", () => ({ get prisma() { return prismaMock; } }));

import { requirePermission } from "@/modules/auth/dal";
import { getReceivablesReport, getReceiptsReport } from "../report-queries";
import { REPORT_PATIENT_SELECT } from "../report-read";
import { REPORT_MESSAGES } from "../report-validation";

const zero = BigInt(0);
const emptyAggregate = { total: zero, chargedCents: "0", receivedCents: "0", balanceCents: "0", overdueCents: "0" };

beforeEach(() => {
  jest.clearAllMocks();
  tx.$queryRaw.mockReset();
  currentUser.role = "RECEPCAO";
  currentUser.active = true;
  tx.patient.findUnique.mockResolvedValue({ id: "p1", fullName: "ANA", status: "INATIVO" });
  tx.$queryRaw.mockImplementation(async (query: { sql: string }) => query.sql.includes("COUNT(*)") ? [emptyAggregate] : []);
});

describe("autorização e minimização FIN-03", () => {
  it.each(["ADMIN", "RECEPCAO", "FISIOTERAPEUTA"])("%s consulta os mesmos pacientes sob financeiro:ler", async (role) => {
    currentUser.role = role;
    await expect(getReceivablesReport({ patientId: "p1" })).resolves.toMatchObject({ error: null, patient: { status: "INATIVO" } });
    await expect(getReceiptsReport({ patientId: "p1" })).resolves.toMatchObject({ error: null, patient: { status: "INATIVO" } });
    expect(requirePermission).toHaveBeenCalledWith("financeiro:ler");
    expect(tx.patient.findUnique).toHaveBeenCalledWith({ where: { id: "p1" }, select: REPORT_PATIENT_SELECT });
  });

  it.each([{ role: null, active: true }, { role: "ADMIN", active: false }, { role: "INEXISTENTE", active: true }])("nega antes de validação e leitura", async (user) => {
    Object.assign(currentUser, user);
    await expect(getReceivablesReport({ patientId: "12345678901" })).rejects.toThrow("redirect");
    await expect(getReceiptsReport({})).rejects.toThrow("redirect");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.patient.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    { start: "2026-10-08", end: "2026-10-07" }, { start: "2026-02-29" }, { patientId: "12345678901" },
    { patientId: ["p1", "p2"] }, { start: ["2026-10-01", "2026-10-02"] }, { cpf: "12345678901" },
  ])("filtros inválidos devolvem erro sem consultar ou ampliar", async (raw) => {
    for (const getReport of [getReceivablesReport, getReceiptsReport]) {
      const result = await getReport(raw);
      expect(result.error).not.toBeNull();
      expect(result).toMatchObject({ filters: null, items: [], total: 0, page: 1, pageCount: 1 });
      expect(result.totals.receivedCents).toBe(zero);
    }
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.patient.findUnique).not.toHaveBeenCalled();
  });

  it("paciente inexistente não transforma filtro em consulta global", async () => {
    tx.patient.findUnique.mockResolvedValue(null);
    expect(await getReceivablesReport({ patientId: "missing" })).toMatchObject({ error: REPORT_MESSAGES.patientNotFound, items: [], filters: { patientId: "missing" } });
    expect(await getReceiptsReport({ patientId: "missing" })).toMatchObject({ error: REPORT_MESSAGES.patientNotFound, items: [] });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("select mínimo e SQL parametrizado não alcançam dados clínicos, CPF ou contato", async () => {
    await getReceivablesReport({ patientId: "p1", start: "2026-10-01", end: "2026-10-07", page: "2" });
    await getReceiptsReport({ patientId: "p1", start: "2026-10-01", end: "2026-10-07" });
    expect(REPORT_PATIENT_SELECT).toEqual({ id: true, fullName: true, status: true });
    for (const [query] of tx.$queryRaw.mock.calls) {
      expect(query.sql).not.toMatch(/SELECT\s+\*/i);
      expect(query.sql).not.toContain("p1");
      expect(query.sql).not.toContain("2026-10-01");
      expect(query.values).toEqual(expect.arrayContaining(["p1", "2026-10-01", "2026-10-07"]));
      for (const forbidden of ["cpf", "phone", "email", "notes", "Anamnesis", "Assessment", "TherapyPlan", "TreatmentSession", "Appointment", "fingerprint", "idempotencyKey"]) {
        expect(query.sql).not.toContain(forbidden);
      }
    }
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
  });
});
