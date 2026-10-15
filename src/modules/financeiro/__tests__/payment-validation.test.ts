/** @jest-environment node */
import { PAYMENT_MESSAGES, createPaymentSchemas, paymentDataSchemas, todayInSaoPaulo } from "../payment-validation";
import { AMOUNT_MAX_CENTS, AMOUNT_MESSAGES } from "../validation";

const now = new Date("2026-10-05T15:00:00.000Z");
const forms = createPaymentSchemas(now);
const data = paymentDataSchemas(now);
const valid = { chargeId: "charge1", amount: "30,01", receivedOn: "2026-10-05", requestId: "request-0001" };
const reversal = { paymentId: "payment1", reason: " Valor informado incorretamente ", reversedOn: "2026-10-05", requestId: "request-0002" };

describe("dia civil da clínica", () => {
  it("usa America/Sao_Paulo, inclusive quando o processo já está no próximo dia UTC", () => {
    expect(todayInSaoPaulo(new Date("2026-10-06T02:59:59.999Z"))).toBe("2026-10-05");
    expect(todayInSaoPaulo(new Date("2026-10-06T03:00:00.000Z"))).toBe("2026-10-06");
  });

  it("vira o limite permitido exatamente à meia-noite da clínica", () => {
    const nextDay = { ...valid, receivedOn: "2026-10-06" };
    expect(createPaymentSchemas(new Date("2026-10-06T02:59:59.999Z")).createPaymentSchema.safeParse(nextDay).success).toBe(false);
    expect(createPaymentSchemas(new Date("2026-10-06T03:00:00.000Z")).createPaymentSchema.safeParse(nextDay).success).toBe(true);
  });
});

describe("recebimento", () => {
  it("converte centavos exatamente e conserva o dia informado em UTC sem hora", () => {
    expect(forms.createPaymentSchema.parse(valid)).toMatchObject({
      chargeId: "charge1",
      amount: 3_001,
      receivedOn: new Date("2026-10-05T00:00:00.000Z"),
      requestId: "request-0001",
    });
    expect(forms.createPaymentSchema.parse({ ...valid, amount: "0,01" }).amount).toBe(1);
  });

  it("aceita hoje e datas retroativas sem exigir data posterior à criação da cobrança", () => {
    expect(forms.createPaymentSchema.parse({ ...valid, receivedOn: "2000-01-01" }).receivedOn).toEqual(new Date("2000-01-01T00:00:00.000Z"));
    expect(forms.createPaymentSchema.parse(valid).receivedOn).toEqual(new Date("2026-10-05T00:00:00.000Z"));
  });

  it("vínculo de substituição é explícito, normalizado, e campo vazio não cria vínculo", () => {
    expect(forms.createPaymentSchema.parse({ ...valid, replacesPaymentId: "  original1  " }).replacesPaymentId).toBe("original1");
    expect(forms.createPaymentSchema.parse({ ...valid, replacesPaymentId: " " }).replacesPaymentId).toBeUndefined();
    expect(forms.createPaymentSchema.parse(valid).replacesPaymentId).toBeUndefined();
  });

  it("descarta autoria e campos de estado enviados pelo formulário", () => {
    const parsed = forms.createPaymentSchema.parse({ ...valid, createdById: "forged", status: "PAGO", balance: 0 });
    expect(parsed).not.toHaveProperty("createdById");
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("balance");
  });

  it.each([
    [{ amount: "0" }, "amount", AMOUNT_MESSAGES.positive],
    [{ amount: "-1" }, "amount", AMOUNT_MESSAGES.format],
    [{ amount: "1,001" }, "amount", AMOUNT_MESSAGES.precision],
    [{ amount: "150.50" }, "amount", AMOUNT_MESSAGES.format],
    [{ amount: "1.000.000,00" }, "amount", AMOUNT_MESSAGES.max],
    [{ chargeId: "a b" }, "chargeId", PAYMENT_MESSAGES.chargeNotFound],
    [{ replacesPaymentId: "a/b" }, "replacesPaymentId", PAYMENT_MESSAGES.paymentNotFound],
    [{ receivedOn: "" }, "receivedOn", PAYMENT_MESSAGES.receivedRequired],
    [{ receivedOn: "2026-02-30" }, "receivedOn", PAYMENT_MESSAGES.receivedInvalid],
    [{ receivedOn: "2026-10-05T00:00:00Z" }, "receivedOn", PAYMENT_MESSAGES.receivedInvalid],
    [{ receivedOn: "05/10/2026" }, "receivedOn", PAYMENT_MESSAGES.receivedInvalid],
    [{ receivedOn: "1999-12-31" }, "receivedOn", PAYMENT_MESSAGES.receivedRange],
    [{ receivedOn: "2101-01-01" }, "receivedOn", PAYMENT_MESSAGES.receivedRange],
    [{ receivedOn: "2026-10-06" }, "receivedOn", PAYMENT_MESSAGES.receivedFuture],
    [{ requestId: "short" }, "requestId", PAYMENT_MESSAGES.requestInvalid],
  ])("recusa %j antes da escrita", (override, field, message) => {
    const result = forms.createPaymentSchema.safeParse({ ...valid, ...override });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors[field as keyof typeof valid | "replacesPaymentId"]).toEqual([message]);
  });

  it("aceita 29 de fevereiro somente em ano bissexto", () => {
    expect(forms.createPaymentSchema.safeParse({ ...valid, receivedOn: "2024-02-29" }).success).toBe(true);
    expect(forms.createPaymentSchema.safeParse({ ...valid, receivedOn: "2025-02-29" }).success).toBe(false);
  });
});

describe("estorno e correção", () => {
  it("normaliza motivo e conserva a data própria do estorno", () => {
    expect(forms.reversePaymentSchema.parse(reversal)).toEqual({
      paymentId: "payment1",
      reason: "Valor informado incorretamente",
      reversedOn: new Date("2026-10-05T00:00:00.000Z"),
      requestId: "request-0002",
    });
  });

  it.each([
    [{ reason: " " }, "reason", "Informe o motivo."],
    [{ reason: "x".repeat(501) }, "reason", "O motivo deve ter no máximo 500 caracteres."],
    [{ paymentId: "" }, "paymentId", PAYMENT_MESSAGES.paymentNotFound],
    [{ reversedOn: "" }, "reversedOn", PAYMENT_MESSAGES.reversedRequired],
    [{ reversedOn: "2026-04-31" }, "reversedOn", PAYMENT_MESSAGES.reversedInvalid],
    [{ reversedOn: "1999-12-31" }, "reversedOn", PAYMENT_MESSAGES.reversedRange],
    [{ reversedOn: "2101-01-01" }, "reversedOn", PAYMENT_MESSAGES.reversedRange],
    [{ reversedOn: "2026-10-06" }, "reversedOn", PAYMENT_MESSAGES.reversedFuture],
  ])("estorno recusa %j", (override, field, message) => {
    const result = forms.reversePaymentSchema.safeParse({ ...reversal, ...override });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors[field as keyof typeof reversal]).toEqual([message]);
  });

  it("correção aceita data retroativa do novo pagamento, independente da data de estorno", () => {
    const corrected = forms.replacePaymentSchema.parse({ ...valid, ...reversal, receivedOn: "2020-02-29" });
    expect(corrected.amount).toBe(3_001);
    expect(corrected.receivedOn).toEqual(new Date("2020-02-29T00:00:00.000Z"));
    expect(corrected.reversedOn).toEqual(new Date("2026-10-05T00:00:00.000Z"));
    expect(corrected).not.toHaveProperty("chargeId");
  });
});

describe("DTO das chamadas diretas de serviço", () => {
  const direct = { chargeId: "charge1", amountCents: 3_001, receivedOn: new Date("2026-10-05T00:00:00.000Z"), requestId: "request-0001" };

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, AMOUNT_MAX_CENTS + 1])("nega centavos inválidos %s", (amountCents) => {
    expect(data.create.safeParse({ ...direct, amountCents }).success).toBe(false);
  });

  it.each([new Date("invalid"), new Date("2026-10-05T12:00:00.000Z"), new Date("2026-10-06T00:00:00.000Z"), "2026-10-05"])(
    "nega data inválida/futura ou instante técnico fornecido como data civil %s", (receivedOn) => {
      expect(data.create.safeParse({ ...direct, receivedOn }).success).toBe(false);
    },
  );

  it("normaliza IDs e motivo sem aceitar campos de autoria", () => {
    const parsed = data.replace.parse({
      paymentId: " payment1 ", amountCents: 1, receivedOn: direct.receivedOn,
      reason: " Motivo ", reversedOn: direct.receivedOn, requestId: direct.requestId, createdById: "forged",
    });
    expect(parsed.paymentId).toBe("payment1");
    expect(parsed.reason).toBe("Motivo");
    expect(parsed).not.toHaveProperty("createdById");
  });
});
