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
