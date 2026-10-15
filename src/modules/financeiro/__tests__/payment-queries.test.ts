/** @jest-environment node */
const currentUser = { role: null as string | null, active: true };
jest.mock("@/modules/auth/dal", () => {
  const { can } = jest.requireActual("@/modules/auth/permissions");
  return { requirePermission: jest.fn(async (permission: string) => {
    if (!currentUser.role || !currentUser.active || !can(currentUser.role, permission)) throw new Error("redirect");
    return { id: "u1", role: currentUser.role };
  }) };
});
const tx = {
  charge: { findUnique: jest.fn() },
  payment: { aggregate: jest.fn(), count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
};
const prismaMock = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
jest.mock("@/lib/db", () => ({ get prisma() { return prismaMock; } }));

import { CHARGE_DETAIL_SELECT } from "../queries";
import { PAYMENT_DETAIL_SELECT, getChargeFinancialDetail, getPaymentFormContext } from "../payment-queries";

beforeEach(() => {
  jest.clearAllMocks();
  currentUser.role = "RECEPCAO";
  currentUser.active = true;
  tx.charge.findUnique.mockResolvedValue({ id: "c1", amountCents: 10000 });
  tx.payment.aggregate.mockResolvedValue({ _sum: { amountCents: 3000 } });
  tx.payment.count.mockResolvedValue(45);
  tx.payment.findMany.mockResolvedValue([{ id: "p1" }]);
  tx.payment.findUnique.mockResolvedValue({ id: "p1", chargeId: "c1" });
});

describe("queries FIN02", () => {
  it.each(["ADMIN", "RECEPCAO", "FISIOTERAPEUTA"])("%s tem alcance igual no detalhe e no formulário", async (role) => {
    currentUser.role = role;
    await expect(getChargeFinancialDetail("c1")).resolves.toMatchObject({ receivedCents: 3000 });
    await expect(getPaymentFormContext("c1", "p1")).resolves.toMatchObject({ payment: { id: "p1" } });
    expect(tx.charge.findUnique).toHaveBeenCalledWith({ where: { id: "c1" }, select: CHARGE_DETAIL_SELECT });
    expect(tx.payment.aggregate).toHaveBeenCalledWith({ where: { chargeId: "c1", reversal: null }, _sum: { amountCents: true } });
  });
  it("anônimo e usuário inativo não abrem transação", async () => {
    for (const user of [{ role: null, active: true }, { role: "ADMIN", active: false }]) {
      Object.assign(currentUser, user);
      await expect(getChargeFinancialDetail("c1")).rejects.toThrow("redirect");
      await expect(getPaymentFormContext("c1", "p1")).rejects.toThrow("redirect");
    }
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
  it("saldo e histórico usam RepeatableRead; 20 por página e totais de todos os pagamentos", async () => {
    expect(await getChargeFinancialDetail("c1", 2)).toMatchObject({ receivedCents: 3000, balanceCents: 7000, settlement: "Parcial", total: 45, page: 2, pageCount: 3 });
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
    expect(tx.payment.findMany).toHaveBeenCalledWith({
      where: { chargeId: "c1" }, orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }, { id: "desc" }], skip: 20, take: 20, select: PAYMENT_DETAIL_SELECT,
    });
    expect(tx.payment.count).toHaveBeenCalledWith({ where: { chargeId: "c1" } });
  });
  it("não inicia uma segunda consulta na conexão enquanto a agregação está em andamento", async () => {
    let finishAggregate!: (value: { _sum: { amountCents: number } }) => void;
    const aggregate = new Promise<{ _sum: { amountCents: number } }>((resolve) => { finishAggregate = resolve; });
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
    tx.payment.aggregate.mockImplementationOnce(() => { notifyStarted(); return aggregate; });
    const result = getChargeFinancialDetail("c1");
    await started;
    expect(tx.payment.aggregate).toHaveBeenCalledTimes(1);
    expect(tx.payment.count).not.toHaveBeenCalled();
    finishAggregate({ _sum: { amountCents: 3000 } });
    await result;
    expect(tx.payment.count).toHaveBeenCalledTimes(1);
  });
  it.each([[null, 10000, "Aberta"], [3001, 6999, "Parcial"], [10000, 0, "Quitada"]])("deriva totais inteiros %s", async (received, balance, settlement) => {
    tx.payment.aggregate.mockResolvedValue({ _sum: { amountCents: received } });
    expect(await getChargeFinancialDetail("c1")).toMatchObject({ receivedCents: received ?? 0, balanceCents: balance, settlement });
  });
  it("página além da última é ajustada; parâmetros inválidos não vão ao banco", async () => {
    expect(await getChargeFinancialDetail("c1", 100)).toMatchObject({ page: 3 });
    expect(await getChargeFinancialDetail("c1", -2)).toMatchObject({ page: 1 });
    jest.clearAllMocks();
    expect(await getChargeFinancialDetail("x y")).toBeNull();
    expect(await getPaymentFormContext("c1", "x y")).toBeNull();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
  it("formulário rejeita pagamento de outra cobrança antes de consultar saldo", async () => {
    tx.payment.findUnique.mockResolvedValue({ id: "p1", chargeId: "c2" });
    expect(await getPaymentFormContext("c1", "p1")).toBeNull();
    expect(tx.payment.aggregate).not.toHaveBeenCalled();
    expect(tx.payment.findMany).not.toHaveBeenCalled();
  });
  it("formulário de recebimento sem vínculo consulta só cobrança e saldo", async () => {
    expect(await getPaymentFormContext("c1")).toMatchObject({ payment: null, balanceCents: 7000 });
    expect(tx.payment.findUnique).not.toHaveBeenCalled();
    expect(tx.payment.findMany).not.toHaveBeenCalled();
    expect(tx.payment.count).not.toHaveBeenCalled();
  });
  it("cobrança ou pagamento inexistente não recebe formulário", async () => {
    tx.charge.findUnique.mockResolvedValue(null);
    expect(await getChargeFinancialDetail("c1")).toBeNull();
    expect(tx.payment.count).not.toHaveBeenCalled();
    tx.charge.findUnique.mockResolvedValue({ id: "c1", amountCents: 10000 });
    tx.payment.findUnique.mockResolvedValue(null);
    expect(await getPaymentFormContext("c1", "p1")).toBeNull();
  });
  it("seleção contém somente histórico administrativo e autoria", () => {
    const select = JSON.stringify(PAYMENT_DETAIL_SELECT);
    for (const forbidden of ["anamneses", "assessments", "therapyPlans", "treatmentSessions", "appointments", "email", "fingerprint", "idempotencyKey"]) {
      expect(select).not.toContain(`\"${forbidden}\"`);
    }
    expect(PAYMENT_DETAIL_SELECT.createdBy).toEqual({ select: { name: true } });
  });
});
