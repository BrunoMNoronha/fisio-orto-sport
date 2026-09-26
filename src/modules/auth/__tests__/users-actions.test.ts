/** @jest-environment node */
// Chamada direta das Server Actions de usuários: a recusa acontece no servidor,
// sem depender de a UI esconder os botões.
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
  user: { create: jest.fn(), findUnique: jest.fn(), count: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  session: { deleteMany: jest.fn() },
  auditLog: { create: jest.fn() },
};
const prismaMock = {
  $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
};
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
      meta?: Record<string, unknown>;
    },
  },
}));

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/modules/auditoria/record", () => ({ requestIp: jest.fn(async () => "10.0.0.9") }));

import { Prisma } from "@/generated/prisma/client";
import { createUser, resetPassword, setUserActive, updateUser } from "../users/actions";

function uniqueError(meta: Record<string, unknown>) {
  const error = new Prisma.PrismaClientKnownRequestError("erro", { code: "P2002", clientVersion: "test" });
  Object.assign(error, { code: "P2002", meta });
  return error;
}

function form(data: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return fd;
}

const newUser = { name: "Bia", email: "bia@x.com", role: "RECEPCAO", password: "12345678" };

beforeEach(() => {
  jest.clearAllMocks();
  currentUser.current = null;
  tx.user.create.mockResolvedValue({ id: "novo-1" });
});

// Registro gravado na transação da alteração (issue #56).
function auditedWith(action: string, targetUserId: string) {
  expect(tx.auditLog.create).toHaveBeenCalledWith({
    data: { action, result: "SUCESSO", actorId: "admin-1", actorRole: "ADMIN", targetUserId, ip: "10.0.0.9" },
    select: { id: true },
  });
}

describe.each([
  ["anônimo", null],
  ["RECEPCAO", "RECEPCAO"],
  ["FISIOTERAPEUTA", "FISIOTERAPEUTA"],
])("%s chamando as actions diretamente", (_label, role) => {
  beforeEach(() => {
    currentUser.current = role ? { id: "u9", name: "X", email: "x@x.com", role } : null;
  });

  it("recusa criar, editar, desativar e redefinir senha sem tocar no banco", async () => {
    await expect(createUser(undefined, form(newUser))).resolves.toEqual({ error: "Acesso negado." });
    await expect(updateUser(undefined, form({ id: "u1", name: "A", role: "ADMIN" }))).resolves.toEqual({
      error: "Acesso negado.",
    });
    await expect(setUserActive(undefined, form({ id: "u1", active: "false" }))).resolves.toEqual({
      error: "Acesso negado.",
    });
    await expect(resetPassword(undefined, form({ id: "u1", password: "12345678" }))).resolves.toEqual({
      error: "Acesso negado.",
    });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("ADMIN", () => {
  beforeEach(() => {
    currentUser.current = { id: "admin-1", name: "Admin", email: "a@x.com", role: "ADMIN" };
  });

  it("cria usuário com hash de senha e e-mail normalizado", async () => {
    const result = await createUser(undefined, form({ ...newUser, email: " BIA@X.com " }));
    expect(result).toMatchObject({ ok: true });
    const data = tx.user.create.mock.calls[0][0].data;
    expect(data.email).toBe("bia@x.com");
    expect(data.passwordHash).toMatch(/^scrypt\$/);
    expect(data).not.toHaveProperty("password");
  });

  it("devolve erros de campo para senha curta", async () => {
    const result = await createUser(undefined, form({ ...newUser, password: "123" }));
    expect(result?.fieldErrors?.password?.[0]).toMatch(/8 caracteres/);
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("cria fisioterapeuta com CREFITO normalizado", async () => {
    const result = await createUser(undefined, form({ ...newUser, role: "FISIOTERAPEUTA", crefito: " 123456-f " }));
    expect(result).toMatchObject({ ok: true });
    expect(tx.user.create.mock.calls[0][0].data).toMatchObject({ role: "FISIOTERAPEUTA", crefito: "123456-F" });
  });

  it("recusa fisioterapeuta sem CREFITO, na criação e na edição, sem tocar no banco", async () => {
    const created = await createUser(undefined, form({ ...newUser, role: "FISIOTERAPEUTA" }));
    expect(created?.fieldErrors?.crefito).toEqual(["Informe o CREFITO do fisioterapeuta."]);
    const updated = await updateUser(undefined, form({ id: "f1", name: "Fisio", role: "FISIOTERAPEUTA", crefito: "" }));
    expect(updated?.fieldErrors?.crefito).toEqual(["Informe o CREFITO do fisioterapeuta."]);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("descarta o CREFITO em outros perfis (ex.: ao deixar de ser fisioterapeuta)", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "f1", role: "FISIOTERAPEUTA", active: true });
    tx.user.count.mockResolvedValue(1);
    const result = await updateUser(undefined, form({ id: "f1", name: "Fisio", role: "RECEPCAO", crefito: "123456-F" }));
    expect(result).toMatchObject({ ok: true });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "f1" },
      data: { name: "Fisio", role: "RECEPCAO", crefito: null },
    });
  });

  it("CREFITO duplicado vira erro de campo sem ecoar o valor; e-mail duplicado segue no e-mail", async () => {
    const physio = { ...newUser, role: "FISIOTERAPEUTA", crefito: "999999-F" };
    tx.user.create.mockRejectedValueOnce(uniqueError({ target: ["crefito"] }));
    const duplicated = await createUser(undefined, form(physio));
    expect(duplicated).toEqual({ fieldErrors: { crefito: ["Já existe um usuário com este CREFITO."] } });
    expect(JSON.stringify(duplicated)).not.toContain("999999");

    tx.user.create.mockRejectedValueOnce(uniqueError({ target: ["email"] }));
    expect(await createUser(undefined, form(physio))).toEqual({
      fieldErrors: { email: ["Já existe um usuário com este e-mail."] },
    });

    tx.user.findUnique.mockResolvedValue({ id: "f1", role: "FISIOTERAPEUTA", active: true });
    tx.user.count.mockResolvedValue(1);
    tx.user.update.mockRejectedValueOnce(
      uniqueError({ driverAdapterError: { cause: { constraint: { fields: ["crefito"] } } } }),
    );
    expect(
      await updateUser(undefined, form({ id: "f1", name: "Fisio", role: "FISIOTERAPEUTA", crefito: "999999-F" })),
    ).toEqual({ fieldErrors: { crefito: ["Já existe um usuário com este CREFITO."] } });
  });

  it("não deixa o admin desativar a si mesmo", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN", active: true });
    tx.user.count.mockResolvedValue(2);
    const result = await setUserActive(undefined, form({ id: "admin-1", active: "false" }));
    expect(result).toEqual({ error: "Você não pode desativar a sua própria conta." });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("não deixa rebaixar o último admin ativo", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "admin-2", role: "ADMIN", active: true });
    tx.user.count.mockResolvedValue(1);
    const result = await updateUser(undefined, form({ id: "admin-2", name: "Outro", role: "RECEPCAO" }));
    expect(result).toEqual({ error: "Não é possível remover o último Administrador ativo." });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("desativar usuário encerra as sessões dele", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "r1", role: "RECEPCAO", active: true });
    tx.user.count.mockResolvedValue(1);
    const result = await setUserActive(undefined, form({ id: "r1", active: "false" }));
    expect(result).toMatchObject({ ok: true });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { active: false } });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "r1" } });
  });

  it("redefinir senha encerra as sessões do usuário", async () => {
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    const result = await resetPassword(undefined, form({ id: "r1", password: "nova-senha-123" }));
    expect(result).toMatchObject({ ok: true });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "r1" } });
  });

  describe("auditoria da gestão de usuários (issue #56)", () => {
    it("registra criação, edição, troca de perfil, (des)ativação e senha na mesma transação", async () => {
      await createUser(undefined, form(newUser));
      auditedWith("USUARIO_CRIADO", "novo-1");

      tx.user.findUnique.mockResolvedValue({ id: "r1", role: "RECEPCAO", active: true });
      tx.user.count.mockResolvedValue(1);
      await updateUser(undefined, form({ id: "r1", name: "Novo nome", role: "RECEPCAO" }));
      auditedWith("USUARIO_EDITADO", "r1");
      await updateUser(undefined, form({ id: "r1", name: "Novo nome", role: "FISIOTERAPEUTA", crefito: "1-F" }));
      auditedWith("PERFIL_ALTERADO", "r1");
      await setUserActive(undefined, form({ id: "r1", active: "false" }));
      auditedWith("USUARIO_DESATIVADO", "r1");
      tx.user.findUnique.mockResolvedValue({ id: "r1", role: "RECEPCAO", active: false });
      await setUserActive(undefined, form({ id: "r1", active: "true" }));
      auditedWith("USUARIO_ATIVADO", "r1");

      tx.user.updateMany.mockResolvedValue({ count: 1 });
      await resetPassword(undefined, form({ id: "r1", password: "nova-senha-123" }));
      auditedWith("SENHA_REDEFINIDA", "r1");

      const recorded = JSON.stringify(tx.auditLog.create.mock.calls);
      expect(recorded).not.toMatch(/scrypt|nova-senha|12345678/);
    });

    it("se o registro falhar, a alteração falha junto (A8)", async () => {
      // Com o PostgreSQL real, a exceção dentro da transação desfaz a alteração (ver integração).
      tx.auditLog.create.mockRejectedValueOnce(new Error("auditoria indisponível"));
      await expect(createUser(undefined, form(newUser))).rejects.toThrow("auditoria indisponível");

      tx.user.findUnique.mockResolvedValue({ id: "r1", role: "RECEPCAO", active: true });
      tx.user.count.mockResolvedValue(1);
      tx.auditLog.create.mockRejectedValueOnce(new Error("auditoria indisponível"));
      await expect(setUserActive(undefined, form({ id: "r1", active: "false" }))).rejects.toThrow("auditoria indisponível");

      tx.user.updateMany.mockResolvedValue({ count: 1 });
      tx.auditLog.create.mockRejectedValueOnce(new Error("auditoria indisponível"));
      await expect(resetPassword(undefined, form({ id: "r1", password: "nova-senha-123" }))).rejects.toThrow(
        "auditoria indisponível",
      );
    });

    it("recusa por salvaguarda não gera registro (a transação não se completa)", async () => {
      tx.user.findUnique.mockResolvedValue({ id: "admin-1", role: "ADMIN", active: true });
      tx.user.count.mockResolvedValue(2);
      await setUserActive(undefined, form({ id: "admin-1", active: "false" }));
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
