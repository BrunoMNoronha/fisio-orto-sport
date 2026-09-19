import {
  ageOn,
  formatCpf,
  formatPhone,
  isMinor,
  isValidCpf,
  listPatientsSchema,
  patientSchema,
  setPatientStatusSchema,
  updatePatientSchema,
} from "../validation";

const VALID_CPF = "52998224725"; // CPF fictício com dígitos verificadores válidos.

function isoYearsAgo(years: number, dayOffset = 0) {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() + dayOffset));
  return date.toISOString().slice(0, 10);
}

const adult = {
  fullName: "  Maria Teste  ",
  birthDate: "1990-05-10",
  sex: "FEMININO",
  occupation: "",
  cpf: "",
  phone: "(11) 98765-4321",
  email: "",
  address: "",
  notes: "",
  guardianName: "",
  guardianPhone: "",
  guardianRelationship: "",
};

function errorsOf(input: unknown) {
  const result = patientSchema.safeParse(input);
  if (result.success) return {};
  // Primeira mensagem de cada campo, como a UI exibe.
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) errors[issue.path.join(".")] ??= issue.message;
  return errors;
}

describe("CPF", () => {
  it("valida dígitos verificadores e recusa sequências repetidas", () => {
    expect(isValidCpf(VALID_CPF)).toBe(true);
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });

  it("é opcional: vazio ou ausente vira null", () => {
    expect(patientSchema.parse(adult).cpf).toBeNull();
    expect(patientSchema.parse({ ...adult, cpf: undefined }).cpf).toBeNull();
  });

  it("normaliza o CPF mascarado para 11 dígitos", () => {
    expect(patientSchema.parse({ ...adult, cpf: "529.982.247-25" }).cpf).toBe(VALID_CPF);
  });

  it("recusa CPF inválido sem ecoar o valor na mensagem", () => {
    const errors = errorsOf({ ...adult, cpf: "529.982.247-24" });
    expect(errors.cpf).toBe("Informe um CPF válido.");
    expect(errors.cpf).not.toContain("529");
  });

  it("formata para exibição", () => {
    expect(formatCpf(VALID_CPF)).toBe("529.982.247-25");
  });
});

describe("telefone", () => {
  it("é obrigatório", () => {
    expect(errorsOf({ ...adult, phone: "" }).phone).toBe("Informe o telefone.");
    expect(errorsOf({ ...adult, phone: undefined }).phone).toBeDefined();
  });

  it("exige 10 ou 11 dígitos e guarda só os dígitos", () => {
    expect(errorsOf({ ...adult, phone: "98765-4321" }).phone).toMatch(/válido/);
    expect(patientSchema.parse(adult).phone).toBe("11987654321");
    expect(patientSchema.parse({ ...adult, phone: "1133334444" }).phone).toBe("1133334444");
  });

  it("formata para exibição", () => {
    expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
  });
});

describe("data de nascimento", () => {
  it("é obrigatória", () => {
    expect(errorsOf({ ...adult, birthDate: "" }).birthDate).toBe("Informe a data de nascimento.");
  });

  it("recusa data futura", () => {
    expect(errorsOf({ ...adult, birthDate: isoYearsAgo(0, 1) }).birthDate).toBe(
      "A data de nascimento não pode ser futura.",
    );
  });

  it("aceita a data de hoje (recém-nascido, com responsável)", () => {
    const result = patientSchema.safeParse({
      ...adult,
      birthDate: isoYearsAgo(0),
      guardianName: "Mãe",
      guardianPhone: "11911112222",
    });
    expect(result.success).toBe(true);
  });

  it("recusa datas inexistentes e formatos inválidos", () => {
    expect(errorsOf({ ...adult, birthDate: "2020-02-30" }).birthDate).toBe("Informe uma data válida.");
    expect(errorsOf({ ...adult, birthDate: "10/05/1990" }).birthDate).toBe("Informe uma data válida.");
    expect(errorsOf({ ...adult, birthDate: "1850-01-01" }).birthDate).toMatch(/1900/);
  });
});

describe("responsável legal", () => {
  it("menor sem responsável é recusado", () => {
    const errors = errorsOf({ ...adult, birthDate: isoYearsAgo(10) });
    expect(errors.guardianName).toMatch(/responsável legal/);
    expect(errors.guardianPhone).toMatch(/responsável legal/);
  });

  it("menor com nome e telefone do responsável é aceito; parentesco é opcional", () => {
    const data = patientSchema.parse({
      ...adult,
      birthDate: isoYearsAgo(10),
      guardianName: "João Responsável",
      guardianPhone: "(11) 91111-2222",
    });
    expect(data.guardianName).toBe("João Responsável");
    expect(data.guardianPhone).toBe("11911112222");
    expect(data.guardianRelationship).toBeNull();
  });

  it("adulto não exige responsável e os dados informados são descartados", () => {
    const data = patientSchema.parse({ ...adult, guardianName: "Alguém", guardianPhone: "11911112222" });
    expect(data.guardianName).toBeNull();
    expect(data.guardianPhone).toBeNull();
    expect(data.guardianRelationship).toBeNull();
  });

  it("limite dos 18 anos: no aniversário já é adulto; na véspera ainda é menor", () => {
    expect(patientSchema.safeParse({ ...adult, birthDate: isoYearsAgo(18) }).success).toBe(true);
    expect(patientSchema.safeParse({ ...adult, birthDate: isoYearsAgo(18, 1) }).success).toBe(false);
  });

  it("calcula idade em data civil", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    expect(ageOn(new Date("2008-09-18T00:00:00Z"), now)).toBe(18);
    expect(ageOn(new Date("2008-09-19T00:00:00Z"), now)).toBe(17);
    expect(isMinor(new Date("2008-09-19T00:00:00Z"), now)).toBe(true);
  });
});

describe("demais campos", () => {
  it("normaliza nome e e-mail; opcionais vazios viram null", () => {
    const data = patientSchema.parse({ ...adult, email: "  Maria@Example.COM " });
    expect(data.fullName).toBe("Maria Teste");
    expect(data.email).toBe("maria@example.com");
    expect(data.address).toBeNull();
    expect(data.notes).toBeNull();
  });

  it("recusa e-mail inválido e nome curto", () => {
    expect(errorsOf({ ...adult, email: "x@" }).email).toBe("Informe um e-mail válido.");
    expect(errorsOf({ ...adult, fullName: "A" }).fullName).toMatch(/2 caracteres/);
  });

  it("limita o tamanho das observações", () => {
    expect(errorsOf({ ...adult, notes: "x".repeat(1001) }).notes).toMatch(/1000/);
  });

  it("não aceita campos fora do contrato (status, dados clínicos)", () => {
    const data = patientSchema.parse({ ...adult, status: "INATIVO", anamnese: "dor" });
    expect(data).not.toHaveProperty("status");
    expect(data).not.toHaveProperty("anamnese");
  });

  it("edição exige id", () => {
    expect(updatePatientSchema.safeParse(adult).success).toBe(false);
    expect(updatePatientSchema.safeParse({ ...adult, id: "p1" }).success).toBe(true);
  });

  it("status aceita apenas ATIVO ou INATIVO", () => {
    expect(setPatientStatusSchema.safeParse({ id: "p1", status: "INATIVO" }).success).toBe(true);
    expect(setPatientStatusSchema.safeParse({ id: "p1", status: "EXCLUIDO" }).success).toBe(false);
  });
});

describe("sexo e profissão (Fase 2c)", () => {
  it("sexo é obrigatório e aceita só as opções da clínica", () => {
    for (const sex of ["FEMININO", "MASCULINO", "NAO_INFORMADO"]) {
      expect(patientSchema.parse({ ...adult, sex }).sex).toBe(sex);
    }
    expect(errorsOf({ ...adult, sex: "" }).sex).toBe("Selecione o sexo.");
    expect(errorsOf({ ...adult, sex: undefined }).sex).toBe("Selecione o sexo.");
    expect(errorsOf({ ...adult, sex: "OUTRO" }).sex).toBe("Selecione o sexo.");
    expect(updatePatientSchema.safeParse({ ...adult, id: "p1", sex: "" }).success).toBe(false);
  });

  it("profissão é opcional, aparada e limitada a 120 caracteres", () => {
    expect(patientSchema.parse(adult).occupation).toBeNull();
    expect(patientSchema.parse({ ...adult, occupation: undefined }).occupation).toBeNull();
    expect(patientSchema.parse({ ...adult, occupation: "  Professora  " }).occupation).toBe("Professora");
    expect(patientSchema.parse({ ...adult, occupation: "x".repeat(120) }).occupation).toHaveLength(120);
    expect(errorsOf({ ...adult, occupation: "x".repeat(121) }).occupation).toBe(
      "A profissão deve ter no máximo 120 caracteres.",
    );
  });
});

describe("parâmetros da listagem", () => {
  it("usa padrões seguros para valores inválidos", () => {
    expect(listPatientsSchema.parse({ q: "  ", status: "X", page: "abc" })).toEqual({
      q: undefined,
      status: undefined,
      page: 1,
    });
    expect(listPatientsSchema.parse({ page: "0" }).page).toBe(1);
    expect(listPatientsSchema.parse({ page: "-3" }).page).toBe(1);
  });

  it("aceita busca, situação e página válidas", () => {
    expect(listPatientsSchema.parse({ q: " Ana ", status: "INATIVO", page: "3" })).toEqual({
      q: "Ana",
      status: "INATIVO",
      page: 3,
    });
  });
});
