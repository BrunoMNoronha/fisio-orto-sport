/** @jest-environment node */
import type { Role } from "@/generated/prisma/enums";
import { PERMISSIONS, ROLES, can, type Permission } from "../permissions";

const expected: Record<Role, Permission[]> = {
  ADMIN: [...PERMISSIONS],
  RECEPCAO: ["pacientes:ler", "pacientes:gerir", "agenda:ler", "agenda:gerir", "financeiro:ler", "financeiro:gerir"],
  // Issue #31: o Fisioterapeuta recebe tudo o que a Recepção tem, além do clínico.
  FISIOTERAPEUTA: [
    "pacientes:ler",
    "pacientes:gerir",
    "agenda:ler",
    "agenda:gerir",
    "clinico:ler",
    "clinico:gerir",
    "financeiro:ler",
    "financeiro:gerir",
  ],
};

describe("can()", () => {
  for (const role of ROLES) {
    for (const permission of PERMISSIONS) {
      const allowed = expected[role].includes(permission);
      it(`${role} ${allowed ? "pode" : "não pode"} ${permission}`, () => {
        expect(can(role, permission)).toBe(allowed);
      });
    }
  }

  it("contrato: toda permissão da Recepção também é do Fisioterapeuta", () => {
    for (const permission of PERMISSIONS) {
      if (can("RECEPCAO", permission)) expect(can("FISIOTERAPEUTA", permission)).toBe(true);
    }
  });

  it("Fisioterapeuta nunca recebe gestão de usuários", () => {
    expect(can("FISIOTERAPEUTA", "usuarios:ler")).toBe(false);
    expect(can("FISIOTERAPEUTA", "usuarios:gerir")).toBe(false);
  });

  it("Recepção não acessa dados clínicos nem usuários", () => {
    expect(can("RECEPCAO", "clinico:ler")).toBe(false);
    expect(can("RECEPCAO", "usuarios:gerir")).toBe(false);
  });

  it("só o Administrador consulta a auditoria (issue #56, A4)", () => {
    expect(can("ADMIN", "auditoria:ler")).toBe(true);
    expect(can("RECEPCAO", "auditoria:ler")).toBe(false);
    expect(can("FISIOTERAPEUTA", "auditoria:ler")).toBe(false);
  });

  it("os três perfis consultam e operam o financeiro com alcance igual (FIN-01, #86)", () => {
    for (const role of ROLES) {
      expect(can(role, "financeiro:ler")).toBe(true);
      expect(can(role, "financeiro:gerir")).toBe(true);
    }
    // O financeiro não amplia o acesso da Recepção a dados clínicos, usuários ou configurações.
    expect(can("RECEPCAO", "clinico:ler")).toBe(false);
    expect(can("RECEPCAO", "configuracoes:ler")).toBe(false);
    expect(can("FISIOTERAPEUTA", "usuarios:ler")).toBe(false);
  });

  it("nega sem perfil ou com perfil desconhecido", () => {
    expect(can(null, "pacientes:ler")).toBe(false);
    expect(can(undefined, "pacientes:ler")).toBe(false);
    expect(can("OUTRO" as Role, "pacientes:ler")).toBe(false);
  });
});
