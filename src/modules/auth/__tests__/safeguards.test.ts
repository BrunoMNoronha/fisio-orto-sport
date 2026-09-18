/** @jest-environment node */
import { checkUserChange } from "../safeguards";

const admin = { id: "admin-1", role: "ADMIN" as const, active: true };
const other = { id: "admin-2", role: "ADMIN" as const, active: true };

describe("checkUserChange", () => {
  it("impede o admin de desativar a si mesmo", () => {
    expect(checkUserChange({ actorId: admin.id, target: admin, next: { active: false }, activeManagerCount: 3 })).toMatch(
      /própria conta/,
    );
  });

  it("impede o admin de rebaixar a si mesmo", () => {
    expect(
      checkUserChange({ actorId: admin.id, target: admin, next: { role: "RECEPCAO" }, activeManagerCount: 3 }),
    ).toMatch(/próprio perfil/);
  });

  it("impede rebaixar o último admin ativo", () => {
    expect(
      checkUserChange({ actorId: "x", target: other, next: { role: "FISIOTERAPEUTA" }, activeManagerCount: 1 }),
    ).toMatch(/último Administrador/);
  });

  it("impede desativar o último admin ativo", () => {
    expect(checkUserChange({ actorId: "x", target: other, next: { active: false }, activeManagerCount: 1 })).toMatch(
      /último Administrador/,
    );
  });

  it("permite rebaixar ou desativar outro admin quando há mais de um", () => {
    expect(checkUserChange({ actorId: admin.id, target: other, next: { role: "RECEPCAO" }, activeManagerCount: 2 })).toBeNull();
    expect(checkUserChange({ actorId: admin.id, target: other, next: { active: false }, activeManagerCount: 2 })).toBeNull();
  });

  it("permite editar o próprio nome mantendo o perfil", () => {
    expect(checkUserChange({ actorId: admin.id, target: admin, next: { role: "ADMIN" }, activeManagerCount: 1 })).toBeNull();
  });

  it("permite desativar usuário não administrador", () => {
    const recepcao = { id: "r1", role: "RECEPCAO" as const, active: true };
    expect(checkUserChange({ actorId: admin.id, target: recepcao, next: { active: false }, activeManagerCount: 1 })).toBeNull();
  });

  it("permite reativar e promover um usuário", () => {
    const inativo = { id: "r2", role: "RECEPCAO" as const, active: false };
    expect(checkUserChange({ actorId: admin.id, target: inativo, next: { active: true }, activeManagerCount: 1 })).toBeNull();
    expect(checkUserChange({ actorId: admin.id, target: inativo, next: { role: "ADMIN" }, activeManagerCount: 1 })).toBeNull();
  });
});
