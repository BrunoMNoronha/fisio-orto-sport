/** @jest-environment node */
const currentUser = { role: null as string | null, active: true };
jest.mock("@/modules/auth/dal", () => {
  const { can } = jest.requireActual("@/modules/auth/permissions");
  class AuthorizationError extends Error {}
  return { AuthorizationError, assertPermission: jest.fn(async (permission: string) => {
    if (!currentUser.role || !currentUser.active || !can(currentUser.role, permission)) throw new AuthorizationError();
    return { id: `u-${currentUser.role}`, role: currentUser.role };
  }) };
});
const prismaMock = { payment: { findUniqueOrThrow: jest.fn() } };
jest.mock("@/lib/db", () => ({ get prisma() { return prismaMock; } }));
jest.mock("../payment-service", () => {
  class PaymentRuleError extends Error { constructor(message: string, public field?: string) { super(message); } }
  return { PaymentRuleError, createPayment: jest.fn(), reversePayment: jest.fn(), replacePayment: jest.fn() };
});
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn((url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); }) }));

import { revalidatePath } from "next/cache";
import { createPaymentAction, reversePaymentAction, replacePaymentAction } from "../payment-actions";
import { PaymentRuleError, createPayment, reversePayment, replacePayment } from "../payment-service";

const receive = { chargeId: "c1", amount: "30,01", receivedOn: "2000-01-02", requestId: "req-1234-abcdef", createdById: "u-forjado" };
const reverse = { paymentId: "p1", reason: "Lançamento incorreto", reversedOn: "2000-01-03", requestId: "req-5678-abcdef" };
const correction = { ...reverse, amount: "25,01", receivedOn: "2000-01-01" };

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
beforeEach(() => {
  jest.clearAllMocks();
  currentUser.role = "RECEPCAO";
  currentUser.active = true;
  (createPayment as jest.Mock).mockResolvedValue({ id: "p1", created: true });
  (reversePayment as jest.Mock).mockResolvedValue({ id: "r1", alreadyReversed: false });
  (replacePayment as jest.Mock).mockResolvedValue({ id: "p2", created: true });
  prismaMock.payment.findUniqueOrThrow.mockResolvedValue({ chargeId: "c1" });
});

describe("actions de pagamento: autorização e autoria", () => {
  const actions = [
    ["receber", () => createPaymentAction(undefined, form(receive))],
    ["estornar", () => reversePaymentAction(undefined, form(reverse))],
    ["corrigir", () => replacePaymentAction(undefined, form(correction))],
  ] as const;
  it.each(actions)("%s nega anônimo e usuário inativo antes de qualquer consulta ou escrita", async (_label, call) => {
    for (const user of [{ role: null, active: true }, { role: "ADMIN", active: false }]) {
      Object.assign(currentUser, user);
      expect(await call()).toEqual({ error: "Acesso negado." });
    }
    expect(createPayment).not.toHaveBeenCalled();
    expect(reversePayment).not.toHaveBeenCalled();
    expect(replacePayment).not.toHaveBeenCalled();
    expect(prismaMock.payment.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  it.each(["ADMIN", "RECEPCAO", "FISIOTERAPEUTA"])("%s usa exclusivamente a autoria da sessão nas chamadas diretas", async (role) => {
    currentUser.role = role;
    await expect(createPaymentAction(undefined, form(receive))).rejects.toMatchObject({ url: "/financeiro/c1" });
    expect(createPayment).toHaveBeenCalledWith(prismaMock, `u-${role}`, {
      chargeId: "c1", amountCents: 3001, receivedOn: new Date("2000-01-02T00:00:00.000Z"), requestId: receive.requestId, replacesPaymentId: undefined,
    });
    expect(await reversePaymentAction(undefined, form({ ...reverse, createdById: "forjado" }))).toEqual({ ok: true, message: "Pagamento estornado." });
    expect(reversePayment).toHaveBeenCalledWith(prismaMock, `u-${role}`, {
      paymentId: "p1", reason: reverse.reason, reversedOn: new Date("2000-01-03T00:00:00.000Z"), requestId: reverse.requestId,
    });
    await expect(replacePaymentAction(undefined, form({ ...correction, chargeId: "outra", createdById: "forjado" }))).rejects.toMatchObject({ url: "/financeiro/c1" });
    expect(replacePayment).toHaveBeenCalledWith(prismaMock, `u-${role}`, {
      paymentId: "p1", amountCents: 2501, receivedOn: new Date("2000-01-01T00:00:00.000Z"), reason: reverse.reason,
      reversedOn: new Date("2000-01-03T00:00:00.000Z"), requestId: reverse.requestId,
    });
    expect(prismaMock.payment.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: "p2" }, select: { chargeId: true } });
    expect(revalidatePath).toHaveBeenCalledWith("/financeiro", "layout");
  });
});

describe("validação e respostas", () => {
  it.each([
    [{ amount: "0" }, "amount"], [{ amount: "10,005" }, "amount"], [{ receivedOn: "2100-01-01" }, "receivedOn"],
    [{ receivedOn: "1999-12-31" }, "receivedOn"], [{ receivedOn: "2000-02-31" }, "receivedOn"], [{ chargeId: "a b" }, "chargeId"],
  ])("recebimento inválido %j não chega ao serviço", async (override, field) => {
    expect((await createPaymentAction(undefined, form({ ...receive, ...override })))?.fieldErrors?.[field]).toHaveLength(1);
    expect(createPayment).not.toHaveBeenCalled();
  });
  it("exige motivo e data de estorno", async () => {
    expect((await reversePaymentAction(undefined, form({ ...reverse, reason: " " })))?.fieldErrors?.reason).toHaveLength(1);
    expect((await replacePaymentAction(undefined, form({ ...correction, reversedOn: "" })))?.fieldErrors?.reversedOn).toHaveLength(1);
    expect(reversePayment).not.toHaveBeenCalled();
    expect(replacePayment).not.toHaveBeenCalled();
  });
  it("vínculo substituto é explícito e não infere um original", async () => {
    await expect(createPaymentAction(undefined, form({ ...receive, replacesPaymentId: "pOriginal" }))).rejects.toMatchObject({ url: "/financeiro/c1" });
    expect(createPayment).toHaveBeenCalledWith(prismaMock, "u-RECEPCAO", expect.objectContaining({ replacesPaymentId: "pOriginal" }));
  });
  it("erro de regra aponta o campo sem ecoar conteúdo enviado", async () => {
    (createPayment as jest.Mock).mockRejectedValue(new PaymentRuleError("O valor supera o saldo disponível.", "amount"));
    expect(await createPaymentAction(undefined, form(receive))).toEqual({ fieldErrors: { amount: ["O valor supera o saldo disponível."] } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("conflito de fingerprint é devolvido e erro inesperado se propaga", async () => {
    (replacePayment as jest.Mock).mockRejectedValue(new PaymentRuleError("Chave reutilizada com outro conteúdo."));
    expect(await replacePaymentAction(undefined, form(correction))).toEqual({ error: "Chave reutilizada com outro conteúdo." });
    expect(prismaMock.payment.findUniqueOrThrow).not.toHaveBeenCalled();
    (reversePayment as jest.Mock).mockRejectedValue(new Error("conexão indisponível"));
    await expect(reversePaymentAction(undefined, form(reverse))).rejects.toThrow("conexão indisponível");
  });
  it("reenvio confirmado mantém o destino; estorno repetido informa sem alterar", async () => {
    (createPayment as jest.Mock).mockResolvedValue({ id: "p1", created: false });
    await expect(createPaymentAction(undefined, form(receive))).rejects.toMatchObject({ url: "/financeiro/c1" });
    (reversePayment as jest.Mock).mockResolvedValue({ id: "r1", alreadyReversed: true });
    expect(await reversePaymentAction(undefined, form(reverse))).toEqual({ ok: true, message: "Este pagamento já estava estornado; nada foi alterado." });
  });
});
