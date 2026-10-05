/** @jest-environment node */
import {
  AMOUNT_MAX_CENTS,
  AMOUNT_MESSAGES,
  cancelChargeSchema,
  createChargeSchema,
  formatAmountInput,
  formatBRL,
  formatCivilDate,
  listChargesSchema,
  parseAmount,
  patientLabel,
  replaceChargeSchema,
} from "../validation";

const valid = {
  patientId: "cpatient1",
  description: "Pacote de 10 sessões — outubro",
  amount: "1.234,56",
  dueDate: "2026-10-31",
  requestId: "req-0001-abcdef",
};

describe("parseAmount: centavos exatos a partir do texto", () => {
  it.each([
    ["150", 15_000],
    ["150,5", 15_050],
    ["150,50", 15_050],
    ["0,01", 1],
    ["0,10", 10],
    ["00,99", 99],
    ["1.234,56", 123_456],
    ["1234,56", 123_456],
    ["999.999,99", AMOUNT_MAX_CENTS],
    ["R$ 80,00", 8_000],
    ["  80,00  ", 8_000],
    // Valores clássicos de erro de ponto flutuante: 0,1 + 0,2 e 1,005 × 100.
    ["0,30", 30],
    ["19,99", 1_999],
  ])("%s → %i centavos", (text, cents) => {
    expect(parseAmount(text)).toEqual({ cents });
  });

  it.each([
    ["", AMOUNT_MESSAGES.required],
    ["   ", AMOUNT_MESSAGES.required],
    ["0", AMOUNT_MESSAGES.positive],
    ["0,00", AMOUNT_MESSAGES.positive],
    ["-10,00", AMOUNT_MESSAGES.format],
    ["10,001", AMOUNT_MESSAGES.precision],
    ["1,234", AMOUNT_MESSAGES.precision],
    ["150.50", AMOUNT_MESSAGES.format],
    ["1.23,00", AMOUNT_MESSAGES.format],
    ["1,2,3", AMOUNT_MESSAGES.format],
    ["abc", AMOUNT_MESSAGES.format],
    ["1e3", AMOUNT_MESSAGES.format],
    ["1.000.000,00", AMOUNT_MESSAGES.max],
    ["99999999999999999999", AMOUNT_MESSAGES.max],
  ])("recusa %j", (text, error) => {
    expect(parseAmount(text)).toEqual({ error });
  });

  it("devolve sempre inteiro", () => {
    for (const text of ["0,07", "12,34", "999,99", "1.000,01"]) {
      const parsed = parseAmount(text);
      expect("cents" in parsed && Number.isInteger(parsed.cents)).toBe(true);
    }
  });
});

describe("formatação", () => {
  it("formata centavos sem ponto flutuante", () => {
    expect(formatBRL(1)).toBe("R$ 0,01");
    expect(formatBRL(15_050)).toBe("R$ 150,50");
    expect(formatBRL(123_456)).toBe("R$ 1.234,56");
    expect(formatBRL(AMOUNT_MAX_CENTS)).toBe("R$ 999.999,99");
    expect(formatAmountInput(100_000)).toBe("1.000,00");
  });

  it("ida e volta: formatar e reler dá o mesmo valor", () => {
    for (const cents of [1, 99, 100, 1_005, 123_456, AMOUNT_MAX_CENTS]) {
      expect(parseAmount(formatAmountInput(cents))).toEqual({ cents });
    }
  });

  it("data civil em UTC não desloca o dia", () => {
    expect(formatCivilDate(new Date("2026-01-01T00:00:00.000Z"))).toBe("01/01/2026");
  });

  it("sinaliza paciente inativo", () => {
    expect(patientLabel({ fullName: "ANA", status: "ATIVO" })).toBe("ANA");
    expect(patientLabel({ fullName: "ANA", status: "INATIVO" })).toBe("ANA (inativo)");
  });
});

describe("createChargeSchema", () => {
  it("aceita e converte", () => {
    const parsed = createChargeSchema.parse(valid);
    expect(parsed).toEqual({
      patientId: "cpatient1",
      description: "Pacote de 10 sessões — outubro",
      amount: 123_456,
      dueDate: new Date("2026-10-31T00:00:00.000Z"),
      requestId: "req-0001-abcdef",
    });
  });

  it("apara a descrição e aceita vencimento passado (lançamento retroativo)", () => {
    const parsed = createChargeSchema.parse({ ...valid, description: "  Avaliação  ", dueDate: "2020-01-15" });
    expect(parsed.description).toBe("Avaliação");
    expect(parsed.dueDate.toISOString()).toBe("2020-01-15T00:00:00.000Z");
  });

  function errors(values: Record<string, unknown>) {
    const result = createChargeSchema.safeParse(values);
    expect(result.success).toBe(false);
    return result.success ? {} : result.error.flatten().fieldErrors;
  }

  it.each([
    [{ amount: "0" }, "amount", AMOUNT_MESSAGES.positive],
    [{ amount: "-1" }, "amount", AMOUNT_MESSAGES.format],
    [{ amount: "10,999" }, "amount", AMOUNT_MESSAGES.precision],
    [{ amount: undefined }, "amount", AMOUNT_MESSAGES.required],
    [{ description: "   " }, "description", "Informe a descrição."],
    [{ description: "x".repeat(201) }, "description", "A descrição deve ter no máximo 200 caracteres."],
    [{ patientId: "" }, "patientId", "Selecione o paciente."],
    [{ patientId: "a b" }, "patientId", "Selecione o paciente."],
    [{ dueDate: "" }, "dueDate", "Informe o vencimento."],
    [{ dueDate: "2026-02-30" }, "dueDate", "Informe um vencimento válido."],
    [{ dueDate: "31/10/2026" }, "dueDate", "Informe um vencimento válido."],
    [{ dueDate: "1999-12-31" }, "dueDate", "Informe um vencimento entre 2000 e 2100."],
    [{ dueDate: "2101-01-01" }, "dueDate", "Informe um vencimento entre 2000 e 2100."],
    [{ requestId: "x" }, "requestId", "Dados inválidos. Recarregue a página."],
  ])("recusa %j", (override, field, message) => {
    expect(errors({ ...valid, ...override })[field as keyof ReturnType<typeof errors>]).toEqual([message]);
  });
});

describe("cancelamento e substituição exigem motivo", () => {
  it("cancelamento", () => {
    expect(cancelChargeSchema.safeParse({ id: "c1", reason: "  " }).success).toBe(false);
    expect(cancelChargeSchema.safeParse({ id: "c1", reason: "x".repeat(501) }).success).toBe(false);
    expect(cancelChargeSchema.parse({ id: "c1", reason: " Lançada em duplicidade " })).toEqual({
      id: "c1",
      reason: "Lançada em duplicidade",
    });
  });

  it("substituição", () => {
    expect(replaceChargeSchema.safeParse({ ...valid, id: "c1" }).success).toBe(false);
    expect(replaceChargeSchema.parse({ ...valid, id: "c1", reason: "Valor errado" }).amount).toBe(123_456);
  });
});

describe("listChargesSchema", () => {
  it("ignora valores inválidos em vez de falhar", () => {
    expect(listChargesSchema.parse({ q: " ana ", status: "PAGA", patientId: "a b", page: "-3" })).toEqual({
      q: "ana",
      status: undefined,
      patientId: undefined,
      page: 1,
    });
    expect(listChargesSchema.parse({ status: "CANCELADA", patientId: "cp1", page: "3" })).toEqual({
      q: undefined,
      status: "CANCELADA",
      patientId: "cp1",
      page: 3,
    });
  });
});
