/** @jest-environment node */
const currentUser = { role: null as string | null };
jest.mock("@/modules/auth/dal", () => ({
  getCurrentUser: jest.fn(async () =>
    currentUser.role ? { id: "u1", name: "Ana", email: "ana@example.com", role: currentUser.role } : null,
  ),
}));
const prismaMock = { $queryRaw: jest.fn() };
jest.mock("@/lib/db", () => ({ get prisma() { return prismaMock; } }));

import { getFinanceKpis } from "../kpi-queries";

const row = { chargedCents: "0", previousChargedCents: "0", openCents: "250", overdueCents: "0", receivedCents: "0", previousReceivedCents: "0" };

beforeEach(() => {
  prismaMock.$queryRaw.mockReset();
  prismaMock.$queryRaw.mockResolvedValue([row]);
  currentUser.role = null;
});

describe("getFinanceKpis", () => {
  it.each(["ADMIN", "RECEPCAO", "FISIOTERAPEUTA"])("%s recebe os indicadores sob financeiro:ler", async (role) => {
    currentUser.role = role;
    await expect(getFinanceKpis(new Date("2026-11-08T12:00:00Z"))).resolves.toMatchObject({ month: "2026-11", openCents: BigInt(250) });
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it.each([null, "INEXISTENTE"])("sem sessão ou sem permissão devolve null sem consultar o banco (%s)", async (role) => {
    currentUser.role = role;
    await expect(getFinanceKpis()).resolves.toBeNull();
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });
});
