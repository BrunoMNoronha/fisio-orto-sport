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
      agendaDefaultView: "dia",
      printShowClinicInfo: false,
      businessHoursEnabled: false,
      businessHours: ";;;;;;",
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
      displayName: "CLÍNICA TESTE",
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

  it("visão inicial da agenda (#69): aceita dia, semana e lista; ausente vira dia; outra é recusada", () => {
    for (const view of ["dia", "semana", "lista"]) {
      expect(settingsSchema.parse({ ...base, agendaDefaultView: view }).agendaDefaultView).toBe(view);
    }
    expect(settingsSchema.parse(base).agendaDefaultView).toBe("dia");
    expect(errorsOf({ agendaDefaultView: "mes" }).agendaDefaultView?.[0]).toBe(
      "Escolha a visão inicial da agenda: Dia, Semana ou Lista.",
    );
    expect(errorsOf({ agendaDefaultView: "DIA" }).agendaDefaultView).toBeDefined();
  });

  it("vários campos inválidos recusam tudo, com erro em cada campo; a faixa invertida é checada com os campos válidos", () => {
    const errors = errorsOf({ agendaDefaultView: "mes", agendaDayStartHour: "30", suggestedDurationMinutes: "900" });
    expect(Object.keys(errors).sort()).toEqual(["agendaDayStartHour", "agendaDefaultView", "suggestedDurationMinutes"]);
    expect(Object.keys(errorsOf({ agendaDefaultView: "lista", agendaDayStartHour: "20", agendaDayEndHour: "8" }))).toEqual([
      "agendaDayEndHour",
    ]);
  });
});
