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
  user: { findUnique: jest.fn(), count: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  session: { deleteMany: jest.fn() },
};
const prismaMock = {
  user: { create: jest.fn() },
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
    },
  },
}));

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import { createUser, resetPassword, setUserActive, updateUser } from "../users/actions";

function form(data: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return fd;
}

const newUser = { name: "Bia", email: "bia@x.com", role: "RECEPCAO", password: "12345678" };

beforeEach(() => {
  jest.clearAllMocks();
  currentUser.current = null;
});

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
    expect(prismaMock.user.create).not.toHaveBeenCalled();
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
    const data = prismaMock.user.create.mock.calls[0][0].data;
    expect(data.email).toBe("bia@x.com");
    expect(data.passwordHash).toMatch(/^scrypt\$/);
    expect(data).not.toHaveProperty("password");
  });

  it("devolve erros de campo para senha curta", async () => {
    const result = await createUser(undefined, form({ ...newUser, password: "123" }));
    expect(result?.fieldErrors?.password?.[0]).toMatch(/8 caracteres/);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
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
});
