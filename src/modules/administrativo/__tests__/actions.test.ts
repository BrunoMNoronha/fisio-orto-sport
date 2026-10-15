/** @jest-environment node */
import { randomUUID } from "node:crypto";

const session = { role: "ADMIN" as string | null };
const saveConfig = jest.fn();
jest.mock("@/lib/db", () => ({ prisma: {} }));
jest.mock("@/modules/auth/dal", () => {
  const { can } = jest.requireActual("@/modules/auth/permissions");
  class AuthorizationError extends Error {}
  return { AuthorizationError, assertPermission: jest.fn(async (permission: string) => {
    if (!can(session.role, permission)) throw new AuthorizationError();
    return { id: "actor-from-session", role: session.role };
  }) };
});
jest.mock("../service", () => ({
  AdministrativeConfigError: class extends Error {},
  saveAdministrativeConfig: (...args: unknown[]) => saveConfig(...args),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }) }));

import { saveOperator, saveContract } from "../actions";
import { saveProcedure, saveTariff, saveProfessional } from "../catalog-actions";

function form(values: Record<string, string> = {}) {
  const fields = { id: randomUUID(), requestId: randomUUID(), expectedVersion: "0", name: "Operadora fictícia", reason: "Cadastro inicial", active: "true", registrationAns: "", ...values };
  const fd = new FormData(); Object.entries(fields).forEach(([k, v]) => fd.set(k, v)); return fd;
}
beforeEach(() => { jest.clearAllMocks(); session.role = "ADMIN"; saveConfig.mockResolvedValue("saved"); });
it.each([null, "RECEPCAO", "FISIOTERAPEUTA"])("nega configuração a %s antes de salvar", async (role) => {
  session.role = role;
  expect(await saveOperator(undefined, form())).toEqual({ error: "Acesso negado." });
  expect(await saveContract(undefined, form())).toEqual({ error: "Acesso negado." });
  for (const action of [saveProcedure, saveTariff, saveProfessional]) expect(await action(undefined, form())).toEqual({ error: "Acesso negado." });
  expect(saveConfig).not.toHaveBeenCalled();
});
it("valida os cadastros do catálogo e usa autoria autenticada", async () => {
  expect((await saveTariff(undefined, form()))?.fieldErrors?.startsOn).toBeDefined();
  expect(saveConfig).not.toHaveBeenCalled();
  const contractId = randomUUID();
  await expect(saveProcedure(undefined, form({ contractId, tableCode: "00", code: "00001", actorId: "forjado" })))
    .rejects.toThrow("REDIRECT:/configuracoes/procedimentos/saved");
  expect(saveConfig.mock.calls[0][1]).toBe("actor-from-session");
  expect(saveConfig.mock.calls[0][2].values.code).toBe("00001");
});
it("valida no servidor e usa autoria da sessão, nunca do formulário", async () => {
  const result = await saveOperator(undefined, form({ name: " " }));
  expect(result?.fieldErrors?.name).toBeDefined(); expect(saveConfig).not.toHaveBeenCalled();
  await expect(saveOperator(undefined, form({ actorId: "attacker" }))).rejects.toThrow("REDIRECT:/configuracoes/operadoras/saved");
  expect(saveConfig.mock.calls[0][1]).toBe("actor-from-session");
});
it("não informa sucesso nem redireciona se a transação falhar", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  saveConfig.mockRejectedValue(new Error("private detail"));
  expect((await saveOperator(undefined, form()))?.error).toContain("Não foi possível salvar");
  expect(log).toHaveBeenCalledWith("[administrativo] falha ao configurar: Error");
  log.mockRestore();
});
it("salva contrato e abre seu detalhe com a identidade retornada pelo serviço", async () => {
  const operatorId = randomUUID();
  await expect(saveContract(undefined, form({ operatorId, providerCode: "0002", cnes: "", tissVersion: "", manualReference: "" })))
    .rejects.toThrow(`REDIRECT:/configuracoes/operadoras/${operatorId}/contratos/saved`);
});
