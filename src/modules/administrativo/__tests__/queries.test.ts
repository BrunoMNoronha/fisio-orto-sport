/** @jest-environment node */
const authorize = jest.fn();
const db = { $transaction: jest.fn(), healthOperator: { findUnique: jest.fn() }, operatorContract: { findUnique: jest.fn() } };
jest.mock("@/modules/auth/dal", () => ({ requirePermission: (...args: unknown[]) => authorize(...args) }));
jest.mock("@/lib/db", () => ({ get prisma() { return db; } }));
import { listOperatorConfigurations, getOperatorConfiguration, getContractConfiguration } from "../queries";
beforeEach(() => { jest.clearAllMocks(); authorize.mockResolvedValue({ id: "a" }); });
it("nega páginas e leituras diretas antes de consultar qualquer tabela", async () => {
  authorize.mockRejectedValue(new Error("denied"));
  await expect(listOperatorConfigurations({})).rejects.toThrow("denied");
  await expect(getOperatorConfiguration("id")).rejects.toThrow("denied");
  await expect(getContractConfiguration("id")).rejects.toThrow("denied");
  expect(db.$transaction).not.toHaveBeenCalled(); expect(db.healthOperator.findUnique).not.toHaveBeenCalled(); expect(db.operatorContract.findUnique).not.toHaveBeenCalled();
});
it("rejeita filtro inválido sem ampliar consulta", async () => {
  expect((await listOperatorConfigurations({ q: ["a", "b"] })).error).toBeTruthy();
  expect(db.$transaction).not.toHaveBeenCalled();
});
it("limita a última página sem perder filtro e lê total/lista no mesmo snapshot", async () => {
  const tx = { healthOperator: { count: jest.fn().mockResolvedValue(41), findMany: jest.fn().mockResolvedValue([{ id: "last", name: "ULTIMA" }]) } };
  db.$transaction.mockImplementation(async (read) => read(tx));
  const result = await listOperatorConfigurations({ q: "sintética", page: "999" });
  expect(result).toMatchObject({ total: 41, page: 3, pages: 3 });
  expect(tx.healthOperator.findMany.mock.calls[0][0]).toMatchObject({ skip: 40, take: 20,
    where: { name: { contains: "sintética", mode: "insensitive" } }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: "RepeatableRead" });
});
