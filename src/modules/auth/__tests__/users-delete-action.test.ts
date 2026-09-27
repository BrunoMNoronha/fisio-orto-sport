/** @jest-environment node */
// Exclusão de usuário desativado (issue #76) por chamada direta da Server Action: autorização,
// estado, autoexclusão e vínculos são conferidos no servidor.
const currentUser = { current: null as null | { id: string; name: string; email: string; role: string } };

jest.mock("../dal", () => {
  const { can } = jest.requireActual("../permissions");
  class AuthorizationError extends Error {}
  return {
    AuthorizationError,
    assertPermission: jest.fn(async (permission: string) => {
      if (!currentUser.current || !can(currentUser.current.role, permission)) throw new AuthorizationError();
      return currentUser.current;
    }),
  };
});

const tx = {
  // Trava da linha (SELECT ... FOR UPDATE): id e ativo.
  $queryRaw: jest.fn(),
  // Existência de vínculo por tabela/coluna.
  $queryRawUnsafe: jest.fn(),
  user: { delete: jest.fn() },
  session: { deleteMany: jest.fn() },
  auditLog: { create: jest.fn() },
};
const prismaMock = { $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) };
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

jest.mock("@/generated/prisma/client", () => ({
  Prisma: {
    TransactionIsolationLevel: { Serializable: "Serializable" },
    PrismaClientKnownRequestError: class extends Error {
      code = "";
    },
  },
}));

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/modules/auditoria/record", () => ({ requestIp: jest.fn(async () => "10.0.0.9") }));

import { revalidatePath } from "next/cache";
import { deleteUser } from "../users/actions";
import { ACTIVE_USER, SELF_DELETE, USER_NOT_FOUND, linkedMessage } from "../users/delete";

function form(data: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return fd;
}

const admin = { id: "admin-1", name: "Admin", email: "a@x.com", role: "ADMIN" };

beforeEach(() => {
  jest.clearAllMocks();
  currentUser.current = admin;
  tx.$queryRaw.mockResolvedValue([{ id: "alvo-1", active: false }]);
  tx.$queryRawUnsafe.mockResolvedValue([{ linked: false }]);
  tx.user.delete.mockResolvedValue({ id: "alvo-1" });
  tx.auditLog.create.mockResolvedValue({ id: "ev-1" });
});

function expectNothingDeleted() {
  expect(tx.user.delete).not.toHaveBeenCalled();
  expect(tx.session.deleteMany).not.toHaveBeenCalled();
  expect(tx.auditLog.create).not.toHaveBeenCalled();
}

describe("deleteUser — autorização", () => {
  it.each([
    ["sem sessão", null],
    ["RECEPCAO", { ...admin, id: "r", role: "RECEPCAO" }],
    ["FISIOTERAPEUTA", { ...admin, id: "f", role: "FISIOTERAPEUTA" }],
  ])("%s é negado antes do banco", async (_label, user) => {
    currentUser.current = user;
    expect(await deleteUser(undefined, form({ id: "alvo-1" }))).toEqual({ error: "Acesso negado." });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("id ausente é recusado sem transação", async () => {
    expect(await deleteUser(undefined, form({}))).toEqual({ error: "Dados inválidos." });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("deleteUser — elegibilidade conferida na transação", () => {
  it("conta desativada sem vínculos: remove sessões, exclui e audita, nessa ordem", async () => {
    expect(await deleteUser(undefined, form({ id: "alvo-1" }))).toEqual({ ok: true, message: "Usuário excluído." });
    const [sql, id] = tx.$queryRaw.mock.calls[0];
    expect(sql.join("?")).toMatch(/FOR UPDATE/);
    expect(id).toBe("alvo-1");
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "alvo-1" } });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: "alvo-1" }, select: { id: true } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: { action: "USUARIO_EXCLUIDO", result: "SUCESSO", actorId: "admin-1", actorRole: "ADMIN", targetUserId: "alvo-1", ip: "10.0.0.9" },
      select: { id: true },
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.user.delete.mock.invocationCallOrder[0]);
    expect(tx.user.delete.mock.invocationCallOrder[0]).toBeLessThan(tx.auditLog.create.mock.invocationCallOrder[0]);
    expect(revalidatePath).toHaveBeenCalledWith("/usuarios");
  });

  it("conta ativa (ou reativada depois de abrir o diálogo) é recusada", async () => {
    tx.$queryRaw.mockResolvedValue([{ id: "alvo-1", active: true }]);
    expect(await deleteUser(undefined, form({ id: "alvo-1" }))).toEqual({ error: ACTIVE_USER });
    expectNothingDeleted();
  });

  it("autoexclusão é recusada mesmo por requisição direta", async () => {
    tx.$queryRaw.mockResolvedValue([{ id: "admin-1", active: false }]);
    expect(await deleteUser(undefined, form({ id: "admin-1" }))).toEqual({ error: SELF_DELETE });
    expectNothingDeleted();
  });

  it("usuário inexistente ou já excluído", async () => {
    tx.$queryRaw.mockResolvedValue([]);
    expect(await deleteUser(undefined, form({ id: "alvo-1" }))).toEqual({ error: USER_NOT_FOUND });
    expectNothingDeleted();
  });

  it("com vínculos, recusa e explica por categoria, sem excluir", async () => {
    tx.$queryRawUnsafe.mockImplementation(async (sql: string) => [{ linked: /"Patient"|"ClinicSettings"/.test(sql) }]);
    const result = await deleteUser(undefined, form({ id: "alvo-1" }));
    expect(result).toEqual({ error: linkedMessage(["pacientes", "configuracoes"]) });
    expect(result?.error).toBe(
      "Este usuário não pode ser excluído porque está vinculado a cadastro de pacientes e configurações da clínica. A conta continua desativada, e o histórico é preservado.",
    );
    expectNothingDeleted();
  });

  it("FK como última barreira vira mensagem controlada", async () => {
    tx.user.delete.mockRejectedValue(Object.assign(new Error("violates foreign key constraint"), { code: "P2003" }));
    const result = await deleteUser(undefined, form({ id: "alvo-1" }));
    expect(result?.error).toMatch(/ainda tem vínculos/);
  });

  it("falha ao auditar não parece sucesso (a transação desfaz a exclusão)", async () => {
    tx.auditLog.create.mockRejectedValue(new Error("falha de auditoria"));
    await expect(deleteUser(undefined, form({ id: "alvo-1" }))).rejects.toThrow("falha de auditoria");
  });
});
