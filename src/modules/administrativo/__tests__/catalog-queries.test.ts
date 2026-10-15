/** @jest-environment node */
const authorize = jest.fn();
const db = { $transaction: jest.fn(), procedureTariff: { findUnique: jest.fn() }, billingProfessional: { findUnique: jest.fn() }, user: { findMany: jest.fn() } };
jest.mock("@/modules/auth/dal", () => ({ requirePermission: (...args: unknown[]) => authorize(...args) }));
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
import { listProcedures, listProfessionals, getProcedure, getTariff, getProfessional, listLinkableUsers, resolveTariff } from "../catalog-queries";
beforeEach(() => { jest.clearAllMocks(); authorize.mockResolvedValue({ id: "a" }); });
it("autoriza todas as leituras antes de consultar o banco, inclusive resolução e busca de usuários", async () => {
  authorize.mockRejectedValue(new Error("denied"));
  for (const call of [() => listProcedures("id",{}), () => listProfessionals({}), () => getProcedure("id"), () => getTariff("id"),
    () => getProfessional("id"), () => listLinkableUsers("fisio"), () => resolveTariff("c","p","2026-01-01")]) {
    await expect(call()).rejects.toThrow("denied");
  }
  expect(db.$transaction).not.toHaveBeenCalled(); expect(db.procedureTariff.findUnique).not.toHaveBeenCalled();
  expect(db.billingProfessional.findUnique).not.toHaveBeenCalled(); expect(db.user.findMany).not.toHaveBeenCalled();
});
it("recusa filtros inválidos e busca de usuário vazia sem ampliar consultas", async () => {
  expect(await listProcedures("id", { page: "0" })).toBeNull();
  expect(await listProfessionals({ q: ["a","b"] })).toBeNull();
  expect(await listLinkableUsers("")).toEqual([]);
  expect(await listLinkableUsers(["a","b"])).toEqual([]);
  expect(db.$transaction).not.toHaveBeenCalled(); expect(db.user.findMany).not.toHaveBeenCalled();
});
it("pagina procedimentos dentro do contrato e inclui inativos apenas para configuração", async () => {
  const tx = { billingProcedure: { count: jest.fn().mockResolvedValue(21), findMany: jest.fn().mockResolvedValue([]) } };
  db.$transaction.mockImplementation(async (read) => read(tx));
  expect(await listProcedures("contrato", { page: "999", q: "0001" })).toMatchObject({ page: 2, pages: 2 });
  expect(tx.billingProcedure.findMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 20, where: { contractId: "contrato" } });
  expect(tx.billingProcedure.findMany.mock.calls[0][0].where).not.toHaveProperty("active");
});
