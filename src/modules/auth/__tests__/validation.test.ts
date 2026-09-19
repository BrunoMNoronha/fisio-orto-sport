/** @jest-environment node */
import { createUserSchema, loginSchema, resetPasswordSchema, setUserActiveSchema, updateUserSchema } from "../validation";

const valid = { name: "Ana Souza", email: "  Ana@Clinica.COM ", role: "RECEPCAO", password: "12345678" };

describe("createUserSchema", () => {
  it("aceita dados válidos e normaliza o e-mail", () => {
    const result = createUserSchema.parse(valid);
    expect(result.email).toBe("ana@clinica.com");
    expect(result.name).toBe("Ana Souza");
  });

  it("exige senha com pelo menos 8 caracteres", () => {
    const result = createUserSchema.safeParse({ ...valid, password: "1234567" });
    expect(result.success).toBe(false);
  });

  it("recusa senha acima de 128 caracteres", () => {
    expect(createUserSchema.safeParse({ ...valid, password: "a".repeat(129) }).success).toBe(false);
  });

  it("recusa e-mail inválido", () => {
    expect(createUserSchema.safeParse({ ...valid, email: "ana" }).success).toBe(false);
  });

  it("recusa perfil fora do enum", () => {
    expect(createUserSchema.safeParse({ ...valid, role: "SUPERUSER" }).success).toBe(false);
  });

  it("recusa nome vazio", () => {
    expect(createUserSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });
});

describe("CREFITO", () => {
  const physio = { ...valid, role: "FISIOTERAPEUTA", crefito: "  123456-f  " };

  it("é obrigatório para Fisioterapeuta, na criação e na edição", () => {
    const missing = createUserSchema.safeParse({ ...physio, crefito: "   " });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]).toMatchObject({
      path: ["crefito"],
      message: "Informe o CREFITO do fisioterapeuta.",
    });
    expect(updateUserSchema.safeParse({ id: "u1", name: "Ana", role: "FISIOTERAPEUTA" }).success).toBe(false);
  });

  it("é normalizado: aparado, espaços internos colapsados e em maiúsculas", () => {
    expect(createUserSchema.parse(physio).crefito).toBe("123456-F");
    expect(createUserSchema.parse({ ...physio, crefito: " crefito-3   123456-f " }).crefito).toBe("CREFITO-3 123456-F");
  });

  it("limita a 20 caracteres", () => {
    expect(createUserSchema.safeParse({ ...physio, crefito: "1".repeat(20) }).success).toBe(true);
    const long = createUserSchema.safeParse({ ...physio, crefito: "1".repeat(21) });
    expect(long.error?.issues[0].message).toBe("O CREFITO deve ter no máximo 20 caracteres.");
  });

  it("é descartado nos demais perfis", () => {
    expect(createUserSchema.parse({ ...valid, crefito: "123456-F" }).crefito).toBeNull();
    expect(updateUserSchema.parse({ id: "u1", name: "Ana", role: "ADMIN", crefito: "123456-F" }).crefito).toBeNull();
  });
});

describe("demais schemas", () => {
  it("updateUserSchema exige id, nome e perfil", () => {
    expect(updateUserSchema.safeParse({ id: "u1", name: "Ana", role: "ADMIN" }).success).toBe(true);
    expect(updateUserSchema.safeParse({ name: "Ana", role: "ADMIN" }).success).toBe(false);
  });

  it("setUserActiveSchema converte o texto em booleano", () => {
    expect(setUserActiveSchema.parse({ id: "u1", active: "false" }).active).toBe(false);
    expect(setUserActiveSchema.parse({ id: "u1", active: "true" }).active).toBe(true);
    expect(setUserActiveSchema.safeParse({ id: "u1", active: "sim" }).success).toBe(false);
  });

  it("resetPasswordSchema aplica a política de senha", () => {
    expect(resetPasswordSchema.safeParse({ id: "u1", password: "curta" }).success).toBe(false);
  });

  it("loginSchema normaliza o e-mail", () => {
    expect(loginSchema.parse({ email: " A@B.COM ", password: "x" }).email).toBe("a@b.com");
  });
});
