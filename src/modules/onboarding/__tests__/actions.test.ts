/** @jest-environment node */
const session = { user: null as null | { id: string; name: string; email: string; role: string } };
jest.mock("@/modules/auth/dal", () => ({ getCurrentUser: jest.fn(async () => session.user) }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
const prismaMock = { user: { updateMany: jest.fn() } };
jest.mock("@/lib/db", () => ({ get prisma() { return prismaMock; } }));

import { revalidatePath } from "next/cache";
import { markFinanceTourSeenAction } from "../actions";

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
  session.user = { id: "u1", name: "Ana", email: "ana@example.com", role: "RECEPCAO" };
});

describe("markFinanceTourSeenAction", () => {
  it("sem sessão nega antes de tocar o banco", async () => {
    session.user = null;
    await expect(markFinanceTourSeenAction()).resolves.toEqual({ error: "Acesso negado." });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("grava para o usuário da sessão só enquanto a coluna está nula e revalida a página inicial", async () => {
    await expect(markFinanceTourSeenAction()).resolves.toEqual({ ok: true });
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1", financeTourSeenAt: null },
      data: { financeTourSeenAt: expect.any(Date) },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("repetir é idempotente: nada a atualizar continua sendo sucesso", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(markFinanceTourSeenAction()).resolves.toEqual({ ok: true });
  });
});
