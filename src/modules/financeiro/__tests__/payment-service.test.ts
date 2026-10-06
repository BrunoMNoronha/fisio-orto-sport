/** @jest-environment node */
import type { PrismaClient } from "@/generated/prisma/client";
import { createPayment, reversePayment, replacePayment, PaymentRuleError, PAYMENT_KEY_MISMATCH, PAYMENT_EXCEEDS_BALANCE } from "../payment-service";
import { PAYMENT_MESSAGES } from "../payment-validation";

// Estes testes cobrem a fronteira de validação e o replay do payload completo. Concorrência,
// constraints e rollback são exercitados separadamente com os serviços no PostgreSQL real.
type Saved = { id: string; idempotencyKey: string; fingerprint: string };
const payments: Saved[] = [];
const reversals: Saved[] = [];
const now = new Date("2026-10-05T15:00:00.000Z");
const day = new Date("2026-10-05T00:00:00.000Z");
const charge = { id: "charge1", status: "ATIVA", amountCents: 10_000 };
const original: {
  id: string; chargeId: string; amountCents: number; receivedOn: Date;
  reversal: { id: string } | null; replacedBy: { id: string } | null;
} = { id: "original1", chargeId: charge.id, amountCents: 3_000, receivedOn: day, reversal: null, replacedBy: null };

const tx = {
  $queryRaw: jest.fn(),
  payment: { findUnique: jest.fn(), aggregate: jest.fn(), create: jest.fn() },
  paymentReversal: { findUnique: jest.fn(), create: jest.fn() },
};
const transaction = jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx));
const db = { $transaction: transaction, payment: tx.payment, paymentReversal: tx.paymentReversal } as unknown as PrismaClient;

beforeEach(() => {
  jest.clearAllMocks();
  payments.length = 0;
  reversals.length = 0;
  charge.status = "ATIVA";
  original.receivedOn = day;
  original.reversal = null;
  original.replacedBy = null;
  tx.$queryRaw.mockResolvedValue([charge]);
  tx.payment.findUnique.mockImplementation(async ({ where }) => {
    if (where.idempotencyKey) return payments.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null;
    if (where.id === original.id) return original;
    return null;
  });
  tx.payment.aggregate.mockImplementation(async () => ({ _sum: { amountCents: original.reversal ? 0 : original.amountCents } }));
  tx.payment.create.mockImplementation(async ({ data }) => {
    const saved = { id: `payment${payments.length + 1}`, ...data };
    payments.push(saved);
    if (data.replacesPaymentId === original.id) original.replacedBy = { id: saved.id };
    return { id: saved.id };
  });
  tx.paymentReversal.findUnique.mockImplementation(async ({ where }) => {
    if (where.idempotencyKey) return reversals.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null;
    return where.paymentId === original.id ? original.reversal : null;
  });
  tx.paymentReversal.create.mockImplementation(async ({ data }) => {
    const saved = { id: `reversal${reversals.length + 1}`, ...data };
    reversals.push(saved);
    original.reversal = { id: saved.id };
    return { id: saved.id };
  });
});

const receiving = () => ({ chargeId: charge.id, amountCents: 3_000, receivedOn: day, requestId: "receive-0001" });
const reversing = () => ({ paymentId: original.id, reason: "Valor incorreto", reversedOn: day, requestId: "reverse-0001" });
const correcting = () => ({ ...reversing(), amountCents: 7_000, receivedOn: day, requestId: "correct-0001" });

describe("validação de chamadas diretas", () => {
  it("não abre transação para dinheiro não inteiro, futuro ou autor inválido", async () => {
    await expect(createPayment(db, "author1", { ...receiving(), amountCents: 1.5 }, { now })).rejects.toMatchObject({ field: "amount" });
    await expect(createPayment(db, "author1", { ...receiving(), receivedOn: new Date("2026-10-06") }, { now })).rejects.toMatchObject({ field: "receivedOn" });
    await expect(createPayment(db, "", receiving(), { now })).rejects.toThrow("Acesso negado.");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("usa o dia do recebimento original para validar estorno, não o do substituto", async () => {
    original.receivedOn = new Date("2026-10-04");
    await expect(reversePayment(db, "author1", { ...reversing(), reversedOn: new Date("2026-10-03") }, { now })).rejects.toMatchObject({
      message: PAYMENT_MESSAGES.reversedBeforeReceived, field: "reversedOn",
    });
    expect(tx.paymentReversal.create).not.toHaveBeenCalled();
  });

  it("recusa excedente sem inserir pagamento", async () => {
    await expect(createPayment(db, "author1", { ...receiving(), amountCents: 7_001 }, { now })).rejects.toMatchObject({
      message: PAYMENT_EXCEEDS_BALANCE, field: "amount",
    });
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});

describe("reenvio estável", () => {
  it("resolve antes do estado/saldo e conserva a autoria da primeira gravação", async () => {
    const first = await createPayment(db, "author1", receiving(), { now });
    charge.status = "CANCELADA";
    tx.payment.aggregate.mockClear();
    expect(await createPayment(db, "author2", { ...receiving(), chargeId: " charge1 " }, { now })).toEqual({ id: first.id, created: false });
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
    expect(tx.payment.create.mock.calls[0][0].data.createdById).toBe("author1");
    expect(tx.payment.create.mock.calls[0][0].data.idempotencyKey).toBe("RECEBIMENTO:receive-0001");
    expect(tx.payment.create.mock.calls[0][0].data.fingerprint).toMatch(/^v1:[0-9a-f]{64}$/);
    expect(tx.payment.aggregate).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted" });
  });

  it("compara todos os dados da correção, incluindo motivo/data do estorno", async () => {
    const first = await replacePayment(db, "author1", correcting(), { now });
    expect(reversals[0].fingerprint).toBe(payments[0].fingerprint);
    expect(reversals[0].idempotencyKey).toBe("CORRECAO:correct-0001");
    original.receivedOn = new Date("2026-10-04");
    charge.status = "CANCELADA";
    expect(await replacePayment(db, "author2", { ...correcting(), reason: "  Valor incorreto  " }, { now })).toEqual({ id: first.id, created: false });
    for (const change of [
      { reason: "Outro motivo" },
      { reversedOn: new Date("2026-10-04") },
      { receivedOn: new Date("2026-10-04") },
      { amountCents: 6_999 },
    ]) {
      await expect(replacePayment(db, "author2", { ...correcting(), ...change }, { now })).rejects.toThrow(PAYMENT_KEY_MISMATCH);
    }
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
    expect(tx.paymentReversal.create).toHaveBeenCalledTimes(1);
  });

  it("estorno com a mesma chave rejeita payload diferente; nova chave conserva o original", async () => {
    const first = await reversePayment(db, "author1", reversing(), { now });
    await expect(reversePayment(db, "author2", { ...reversing(), reason: "Outro motivo" }, { now })).rejects.toThrow(PAYMENT_KEY_MISMATCH);
    charge.status = "CANCELADA";
    expect(await reversePayment(db, "author2", { ...reversing(), requestId: "reverse-0002", reason: "Outro motivo" }, { now })).toEqual({ id: first.id, alreadyReversed: true });
    expect(tx.paymentReversal.create).toHaveBeenCalledTimes(1);
    expect(tx.paymentReversal.create.mock.calls[0][0].data).toMatchObject({ reason: "Valor incorreto", createdById: "author1" });
  });

  it("registrar substituto exige vínculo explícito e mantém o estorno anterior", async () => {
    await reversePayment(db, "author1", reversing(), { now });
    const result = await createPayment(db, "author2", { ...receiving(), replacesPaymentId: original.id }, { now });
    expect(result.created).toBe(true);
    expect(tx.paymentReversal.create).toHaveBeenCalledTimes(1);
    expect(tx.payment.create.mock.calls[0][0].data.replacesPaymentId).toBe(original.id);
    await expect(createPayment(db, "author2", { ...receiving(), requestId: "receive-0002", replacesPaymentId: original.id }, { now })).rejects.toThrow(PAYMENT_MESSAGES.alreadyReplaced);
  });

  it("um recebimento comum após estorno permanece sem vínculo automático", async () => {
    await reversePayment(db, "author1", reversing(), { now });
    await createPayment(db, "author2", receiving(), { now });
    expect(tx.payment.create.mock.calls[0][0].data.replacesPaymentId).toBeUndefined();
  });

  it("erro inesperado continua visível e não provoca nova tentativa de escrita", async () => {
    tx.payment.create.mockRejectedValueOnce(new Error("Falha inesperada"));
    await expect(createPayment(db, "author1", receiving(), { now })).rejects.toThrow("Falha inesperada");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
    expect(new PaymentRuleError("Erro", "amount")).toMatchObject({ name: "PaymentRuleError", field: "amount" });
  });
});
