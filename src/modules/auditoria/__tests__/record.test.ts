/** @jest-environment node */
// Política de falha de A8 para login, logout e acesso negado: a gravação nunca bloqueia a ação e a
// falha vai para o log do servidor sem dado pessoal (issue #56).
const create = jest.fn();
const executeRaw = jest.fn();
jest.mock("@/lib/db", () => ({
  get prisma() {
    return { auditLog: { create }, $executeRaw: executeRaw };
  },
}));
let requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
jest.mock("next/headers", () => ({ headers: async () => requestHeaders }));

import { hashEmail } from "../events";
import { purgeExpiredAuditSafely, recordAudit } from "../record";

let consoleError: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.VERCEL = "1";
  requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe("recordAudit", () => {
  it("grava com o IP do proxy confiável e sem datar o registro", async () => {
    await recordAudit({ action: "LOGIN", result: "SUCESSO", actorId: "u1", actorRole: "ADMIN", targetUserId: "u1" });
    expect(create).toHaveBeenCalledWith({
      data: { action: "LOGIN", result: "SUCESSO", actorId: "u1", actorRole: "ADMIN", targetUserId: "u1", ip: "203.0.113.7" },
      select: { id: true },
    });
  });

  it("sem proxy confiável, não aceita IP de cabeçalho forjável", async () => {
    delete process.env.VERCEL;
    await recordAudit({ action: "LOGOUT", result: "SUCESSO", actorId: "u1" });
    expect(create.mock.calls[0][0].data.ip).toBeNull();
  });

  it("falha ao gravar não lança e loga só ação e código, sem e-mail, hash ou IP", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("connect ECONNREFUSED ana@x.com"), { code: "P1001" }));
    const emailHash = hashEmail("ana@x.com");
    await expect(recordAudit({ action: "LOGIN", result: "FALHA", emailHash })).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledTimes(1);
    const line = String(consoleError.mock.calls[0][0]);
    expect(line).toBe("[auditoria] falha ao gravar LOGIN. Error P1001");
    expect(line).not.toMatch(/ana@x|203\.0\.113/);
    expect(line).not.toContain(emailHash);
  });
});

describe("hashEmail", () => {
  it("normaliza e nunca devolve o e-mail em claro", () => {
    expect(hashEmail(" Ana@X.com ")).toBe(hashEmail("ana@x.com"));
    expect(hashEmail("ana@x.com")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashEmail("ana@x.com")).not.toContain("ana");
  });
});

describe("purgeExpiredAuditSafely", () => {
  it("expurga pelo relógio do banco e não lança se falhar", async () => {
    executeRaw.mockResolvedValueOnce(3);
    await purgeExpiredAuditSafely();
    expect(String(executeRaw.mock.calls[0][0].join("?"))).toContain('DELETE FROM "AuditLog" WHERE "createdAt" < now()');
    expect(executeRaw.mock.calls[0][1]).toBe(7);

    executeRaw.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "P1001" }));
    await expect(purgeExpiredAuditSafely()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith("[auditoria] falha ao expurgar registros vencidos. Error P1001");
  });
});
