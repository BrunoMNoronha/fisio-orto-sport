/** @jest-environment node */
const prismaMock = { user: { findUnique: jest.fn() } };
jest.mock("@/lib/db", () => ({ get prisma() { return prismaMock; } }));

import { hasSeenFinanceTour } from "../queries";

beforeEach(() => prismaMock.user.findUnique.mockReset());

describe("hasSeenFinanceTour", () => {
  it("lê só a coluna do tour do usuário informado", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ financeTourSeenAt: new Date("2026-11-08T12:00:00Z") });
    await expect(hasSeenFinanceTour("u1")).resolves.toBe(true);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { financeTourSeenAt: true } });
  });

  it("nulo ou usuário ausente significa que ainda não viu", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ financeTourSeenAt: null });
    await expect(hasSeenFinanceTour("u1")).resolves.toBe(false);
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    await expect(hasSeenFinanceTour("u2")).resolves.toBe(false);
  });

  it("erro de leitura propaga em vez de virar padrão", async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error("banco indisponível"));
    await expect(hasSeenFinanceTour("u1")).rejects.toThrow("banco indisponível");
  });
});
