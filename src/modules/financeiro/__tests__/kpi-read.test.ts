/** @jest-environment node */
import { readFinanceKpis } from "../kpi-read";

const row = {
  chargedCents: "9007199254740994",
  previousChargedCents: "100",
  openCents: "250",
  overdueCents: "50",
  receivedCents: "9007199254740993",
  previousReceivedCents: "0",
};
const db = { $queryRaw: jest.fn() };
type Query = { sql: string; values: unknown[] };
const lastQuery = () => db.$queryRaw.mock.calls[0][0] as Query;

beforeEach(() => {
  db.$queryRaw.mockReset();
  db.$queryRaw.mockResolvedValue([row]);
});

describe("readFinanceKpis", () => {
  it("converte os totais em bigint exato numa única consulta", async () => {
    const kpis = await readFinanceKpis(db, new Date("2026-11-08T12:00:00Z"));
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(kpis).toEqual({
      today: "2026-11-08",
      month: "2026-11",
      previousMonth: "2026-10",
      chargedCents: BigInt("9007199254740994"),
      previousChargedCents: BigInt(100),
      receivedCents: BigInt("9007199254740993"),
      previousReceivedCents: BigInt(0),
      openCents: BigInt(250),
      overdueCents: BigInt(50),
    });
  });

  it("parametriza as datas pelo dia civil de São Paulo, dos dois lados da meia-noite", async () => {
    // 23h59 de 30/11 em São Paulo (UTC-3): o mês ainda é novembro.
    await readFinanceKpis(db, new Date("2026-12-01T02:59:59.999Z"));
    expect(lastQuery().values).toEqual(expect.arrayContaining(["2026-11-30", "2026-11-01", "2026-12-01", "2026-10-01"]));

    db.$queryRaw.mockClear();
    await readFinanceKpis(db, new Date("2026-12-01T03:00:00.000Z"));
    const query = lastQuery();
    expect(query.values).toEqual(expect.arrayContaining(["2026-12-01", "2027-01-01", "2026-11-01"]));
    expect(query.sql).not.toContain("2026-12-01");
  });

  it("SQL só agrega cobranças ativas e pagamentos sem estorno, sem alcançar dados clínicos", async () => {
    await readFinanceKpis(db, new Date("2026-11-08T12:00:00Z"));
    const { sql } = lastQuery();
    expect(sql).toContain(`c."status" = 'ATIVA'`);
    expect(sql).toContain(`NOT EXISTS (SELECT 1 FROM "PaymentReversal"`);
    expect(sql).toContain(`"balanceCents" > 0`);
    expect(sql).toContain("CROSS JOIN");
    expect(sql).not.toMatch(/SELECT\s+\*/i);
    for (const forbidden of ["cpf", "phone", "email", "notes", "Anamnesis", "Assessment", "TherapyPlan", "TreatmentSession", "Appointment", "Patient", "fullName"]) {
      expect(sql).not.toContain(forbidden);
    }
  });
});
