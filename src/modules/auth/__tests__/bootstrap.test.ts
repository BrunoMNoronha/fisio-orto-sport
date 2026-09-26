/** @jest-environment node */
// Autorização do primeiro acesso: SETUP_TOKEN com falha segura.
jest.mock("@/generated/prisma/client", () => ({ Prisma: {} }));

import { SETUP_TOKEN_MIN, isSetupEnabled, isValidSetupToken } from "../bootstrap";

const TOKEN = "a".repeat(SETUP_TOKEN_MIN);

afterEach(() => {
  delete process.env.SETUP_TOKEN;
});

describe("isSetupEnabled", () => {
  it("fica desligado sem a variável, vazia ou curta demais", () => {
    expect(isSetupEnabled()).toBe(false);
    process.env.SETUP_TOKEN = "   ";
    expect(isSetupEnabled()).toBe(false);
    process.env.SETUP_TOKEN = "a".repeat(SETUP_TOKEN_MIN - 1);
    expect(isSetupEnabled()).toBe(false);
  });

  it("liga com pelo menos SETUP_TOKEN_MIN caracteres", () => {
    process.env.SETUP_TOKEN = TOKEN;
    expect(isSetupEnabled()).toBe(true);
  });
});

describe("isValidSetupToken", () => {
  it("aceita só o código configurado (espaços nas pontas ignorados)", () => {
    process.env.SETUP_TOKEN = TOKEN;
    expect(isValidSetupToken(TOKEN)).toBe(true);
    expect(isValidSetupToken(` ${TOKEN}\n`)).toBe(true);
    expect(isValidSetupToken(TOKEN + "b")).toBe(false);
    expect(isValidSetupToken(TOKEN.toUpperCase())).toBe(false);
    expect(isValidSetupToken("")).toBe(false);
    expect(isValidSetupToken(null)).toBe(false);
    expect(isValidSetupToken("a".repeat(600))).toBe(false);
  });

  it("recusa qualquer valor quando o primeiro acesso está desligado", () => {
    expect(isValidSetupToken("")).toBe(false);
    process.env.SETUP_TOKEN = "curto";
    expect(isValidSetupToken("curto")).toBe(false);
  });
});
