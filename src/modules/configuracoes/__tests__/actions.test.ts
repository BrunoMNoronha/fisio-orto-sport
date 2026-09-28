/** @jest-environment node */
// Chamada direta da Server Action: a recusa acontece no servidor, sem depender do menu.
const currentUser = { current: null as null | { id: string; name: string; email: string; role: string } };

jest.mock("@/modules/auth/dal", () => {
  const { can } = jest.requireActual("@/modules/auth/permissions");
  class AuthorizationError extends Error {}
  return {
    AuthorizationError,
    assertPermission: jest.fn(async (permission: string) => {
      if (!currentUser.current || !can(currentUser.current.role, permission)) throw new AuthorizationError();
      return currentUser.current;
    }),
  };
});

jest.mock("@/lib/db", () => ({ prisma: {} }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/modules/auditoria/record", () => ({ requestIp: jest.fn(async () => "10.0.0.9") }));

const save = jest.fn();
jest.mock("../write", () => {
  class SettingsConflictError extends Error {
    constructor() {
      super("As configurações foram alteradas por outra pessoa. Recarregue a página para ver a versão atual.");
    }
  }
  return { SettingsConflictError, saveClinicSettings: (...args: unknown[]) => save(...args) };
});

import { revalidatePath } from "next/cache";
import { saveSettings } from "../actions";
import { SettingsConflictError } from "../write";

function form(data: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return fd;
}

const valid = { displayName: "Clínica Teste", agendaDayStartHour: "7", agendaDayEndHour: "20", expectedVersion: "0" };
const admin = { id: "u-admin", name: "Admin", email: "a@x.test", role: "ADMIN" };

beforeEach(() => {
  jest.clearAllMocks();
  currentUser.current = admin;
  save.mockResolvedValue({ version: 1, fields: ["displayName"] });
});

describe("saveSettings — autorização", () => {
  it.each([
    ["sem sessão", null],
    ["Recepção", { ...admin, id: "u-r", role: "RECEPCAO" }],
    ["Fisioterapeuta", { ...admin, id: "u-f", role: "FISIOTERAPEUTA" }],
  ])("%s não grava", async (_label, user) => {
    currentUser.current = user;
    expect(await saveSettings(undefined, form(valid))).toEqual({ error: "Acesso negado." });
    expect(save).not.toHaveBeenCalled();
  });

  it("Administrador grava com a versão lida, o autor e o IP", async () => {
    const result = await saveSettings(undefined, form(valid));
    expect(result).toEqual({ ok: true, message: "Configurações salvas.", version: 1 });
    expect(save).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        expectedVersion: 0,
        actor: { id: "u-admin", role: "ADMIN", ip: "10.0.0.9" },
        values: expect.objectContaining({ displayName: "CLÍNICA TESTE", agendaDayStartHour: 7 }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("saveSettings — falhas", () => {
  it("dado inválido não chama a gravação (nada parcial)", async () => {
    const result = await saveSettings(undefined, form({ ...valid, cnpj: "123", agendaDayEndHour: "5" }));
    expect(result?.error).toBe("Corrija os campos destacados. Nada foi salvo.");
    expect(result?.fieldErrors).toMatchObject({
      cnpj: ["Informe um CNPJ válido."],
      agendaDayEndHour: ["O fim da faixa deve ser depois do início."],
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("conflito de versão avisa em vez de sobrescrever", async () => {
    save.mockRejectedValue(new SettingsConflictError());
    const result = await saveSettings(undefined, form({ ...valid, expectedVersion: "2" }));
    expect(result).toEqual({ error: expect.stringMatching(/alteradas por outra pessoa/), conflict: true });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("falha de persistência nunca parece sucesso", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    save.mockRejectedValue(new Error("conexão perdida"));
    const result = await saveSettings(undefined, form(valid));
    expect(result).toEqual({ error: "Não foi possível salvar as configurações. Nada foi alterado; tente novamente." });
    expect(result).not.toHaveProperty("ok");
    expect(spy.mock.calls[0][0]).not.toMatch(/conexão perdida/);
    spy.mockRestore();
  });

  it("sem mudança real, informa e não revalida", async () => {
    save.mockResolvedValue({ version: 4, fields: [] });
    const result = await saveSettings(undefined, form({ ...valid, expectedVersion: "4" }));
    expect(result).toEqual({ ok: true, message: "Nenhuma alteração para salvar.", version: 4 });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("visão inicial inválida (#69) não grava nada; válida chega à gravação", async () => {
    const invalid = await saveSettings(undefined, form({ ...valid, agendaDefaultView: "mes" }));
    expect(invalid?.fieldErrors?.agendaDefaultView).toBeDefined();
    expect(save).not.toHaveBeenCalled();
    await saveSettings(undefined, form({ ...valid, agendaDefaultView: "semana" }));
    expect(save.mock.calls[0][1].values.agendaDefaultView).toBe("semana");
  });
});
