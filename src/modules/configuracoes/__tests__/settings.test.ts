import {
  DEFAULT_SETTINGS,
  auditDetails,
  changedFields,
  formatCnpj,
  identityLines,
  isValidCnpj,
  maskCnpj,
  suggestEndTime,
} from "../settings";

describe("padrões", () => {
  it("preservam o comportamento anterior: sem dados da clínica, grade 07–20, sem duração, impressão só com a marca", () => {
    expect(DEFAULT_SETTINGS).toEqual({
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
    });
  });
});

describe("CNPJ", () => {
  it("aceita dígitos verificadores corretos e recusa os errados ou repetidos", () => {
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("11222333000182")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("1122233300018")).toBe(false);
  });

  it("formata e mascara", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(maskCnpj("112223330")).toBe("11.222.333/0");
    expect(maskCnpj("11.222.333/0001-81xx")).toBe("11.222.333/0001-81");
  });
});

describe("suggestEndTime", () => {
  it("soma a duração ao início", () => {
    expect(suggestEndTime("09:00", 50)).toBe("09:50");
    expect(suggestEndTime("09:40", 50)).toBe("10:30");
  });

  it("não sugere sem duração, com início inválido ou passando da meia-noite", () => {
    expect(suggestEndTime("09:00", null)).toBe("");
    expect(suggestEndTime("", 50)).toBe("");
    expect(suggestEndTime("9:00", 50)).toBe("");
    expect(suggestEndTime("23:30", 30)).toBe("");
    expect(suggestEndTime("23:00", 59)).toBe("23:59");
  });
});

describe("auditoria", () => {
  it("lista só os campos alterados", () => {
    const after = { ...DEFAULT_SETTINGS, phone: "61999990000", agendaDayEndHour: 21 };
    expect(changedFields(DEFAULT_SETTINGS, after)).toEqual(["phone", "agendaDayEndHour"]);
    expect(changedFields(after, after)).toEqual([]);
  });

  it("resume versão e nomes dos campos, sem os valores", () => {
    const details = auditDetails(3, ["phone", "email"]);
    expect(details).toBe("Versão 3: Telefone, E-mail");
    expect(details).not.toMatch(/\d{8}/);
  });
});

describe("identityLines", () => {
  it("omite campos vazios sem deixar separadores", () => {
    expect(
      identityLines({ displayName: null, legalName: null, cnpj: null, phone: "6133334444", email: null, address: null }),
    ).toEqual({ title: null, lines: ["(61) 3333-4444"] });
  });

  it("agrupa razão social com CNPJ e telefone com e-mail", () => {
    expect(
      identityLines({
        displayName: "Clínica Teste",
        legalName: "Clínica Teste Ltda",
        cnpj: "11222333000181",
        phone: "61999990000",
        email: "contato@exemplo.test",
        address: "Rua Fictícia, 1",
      }),
    ).toEqual({
      title: "Clínica Teste",
      lines: [
        "Clínica Teste Ltda · CNPJ 11.222.333/0001-81",
        "(61) 99999-0000 · contato@exemplo.test",
        "Rua Fictícia, 1",
      ],
    });
  });
});

describe("limites compartilhados (#69)", () => {
  it("o teto da duração sugerida é o mesmo teto técnico da agenda", async () => {
    const { MAX_DURATION_MINUTES } = await import("@/modules/agenda/validation");
    const { SETTINGS_LIMITS } = await import("../settings");
    expect(SETTINGS_LIMITS.maxDuration).toBe(MAX_DURATION_MINUTES);
  });
});
