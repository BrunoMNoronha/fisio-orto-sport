import { settingsSchema } from "../validation";

const base = {
  displayName: "",
  legalName: "",
  cnpj: "",
  phone: "",
  email: "",
  address: "",
  agendaDayStartHour: "7",
  agendaDayEndHour: "20",
  suggestedDurationMinutes: "",
  printShowClinicInfo: undefined,
  expectedVersion: "0",
};

function errorsOf(input: Record<string, unknown>) {
  const parsed = settingsSchema.safeParse({ ...base, ...input });
  return parsed.success ? {} : parsed.error.flatten().fieldErrors;
}

describe("settingsSchema", () => {
  it("formulário vazio vira os padrões, com opcionais nulos", () => {
    expect(settingsSchema.parse(base)).toEqual({
      displayName: null,
      legalName: null,
      cnpj: null,
      phone: null,
      email: null,
      address: null,
      agendaDayStartHour: 7,
      agendaDayEndHour: 20,
      suggestedDurationMinutes: null,
      printShowClinicInfo: false,
      expectedVersion: 0,
    });
  });

  it("normaliza máscaras, espaços e e-mail", () => {
    const parsed = settingsSchema.parse({
      ...base,
      displayName: "  Clínica Teste  ",
      cnpj: "11.222.333/0001-81",
      phone: "(61) 99999-0000",
      email: " Contato@Exemplo.TEST ",
      suggestedDurationMinutes: "50",
      printShowClinicInfo: "on",
    });
    expect(parsed).toMatchObject({
      displayName: "Clínica Teste",
      cnpj: "11222333000181",
      phone: "61999990000",
      email: "contato@exemplo.test",
      suggestedDurationMinutes: 50,
      printShowClinicInfo: true,
    });
  });

  it("recusa dados inválidos com mensagens em pt-BR", () => {
    expect(errorsOf({ cnpj: "11.222.333/0001-82" }).cnpj).toEqual(["Informe um CNPJ válido."]);
    expect(errorsOf({ phone: "123" }).phone?.[0]).toMatch(/telefone válido/);
    expect(errorsOf({ email: "sem-arroba" }).email).toEqual(["Informe um e-mail válido."]);
    expect(errorsOf({ displayName: "x".repeat(121) }).displayName?.[0]).toMatch(/no máximo 120/);
    expect(errorsOf({ address: "x".repeat(301) }).address?.[0]).toMatch(/no máximo 300/);
  });

  it("exige fim da faixa depois do início e horas dentro do dia", () => {
    expect(errorsOf({ agendaDayStartHour: "10", agendaDayEndHour: "10" }).agendaDayEndHour).toEqual([
      "O fim da faixa deve ser depois do início.",
    ]);
    expect(errorsOf({ agendaDayStartHour: "24" }).agendaDayStartHour?.[0]).toMatch(/entre 0 e 23/);
    expect(errorsOf({ agendaDayEndHour: "25" }).agendaDayEndHour?.[0]).toMatch(/entre 1 e 24/);
    expect(errorsOf({ agendaDayStartHour: "7.5" }).agendaDayStartHour?.[0]).toMatch(/horas inteiras/);
  });

  it("limita a duração sugerida a 5–720 minutos inteiros", () => {
    expect(errorsOf({ suggestedDurationMinutes: "4" }).suggestedDurationMinutes?.[0]).toMatch(/entre 5 e 720/);
    expect(errorsOf({ suggestedDurationMinutes: "721" }).suggestedDurationMinutes?.[0]).toMatch(/entre 5 e 720/);
    expect(errorsOf({ suggestedDurationMinutes: "-5" }).suggestedDurationMinutes?.[0]).toMatch(/minutos inteiros/);
    expect(errorsOf({ suggestedDurationMinutes: "720" })).toEqual({});
  });
});
