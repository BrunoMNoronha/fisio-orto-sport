/** @jest-environment node */
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { readReceivablesReport, readReceiptsReport } from "../report-read";

const tx = { patient: { findUnique: jest.fn() }, $queryRaw: jest.fn() };
const db = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
const client = db as unknown as Pick<PrismaClient, "$transaction">;
const amount = BigInt("9007199254740993");
const patientColumns = { patientId: "p1", fullName: "ANA", patientStatus: "INATIVO" };
const aggregate = { total: BigInt(45), chargedCents: "9007199254740994", receivedCents: "1", balanceCents: "9007199254740993", overdueCents: "9007199254740993" };

beforeEach(() => {
  jest.clearAllMocks();
  tx.$queryRaw.mockReset();
  tx.patient.findUnique.mockResolvedValue(null);
});

describe("leitura agregada FIN-03", () => {
  it("contas preservam inteiros além do limite seguro, totais do filtro e DTO mínimo", async () => {
    tx.$queryRaw.mockResolvedValueOnce([aggregate]).mockResolvedValueOnce([{
      ...patientColumns, id: "c1", description: "Sessão", dueDate: new Date("2026-10-05"),
      amountCents: amount + BigInt(1), receivedCents: BigInt(1), balanceCents: amount, overdue: true,
      cpf: "dado inesperado não deve sair", notes: "conteúdo não selecionado",
    }]);
    expect(await readReceivablesReport(client, { page: 100 }, new Date("2026-10-06T03:00:00Z"))).toEqual({
      error: null, filters: { page: 100 }, patient: null, total: 45, page: 3, pageCount: 3, pageSize: 20,
      totals: { chargedCents: amount + BigInt(1), receivedCents: BigInt(1), balanceCents: amount, overdueCents: amount },
      items: [{ id: "c1", description: "Sessão", dueDate: new Date("2026-10-05"), amountCents: amount + BigInt(1), receivedCents: BigInt(1), balanceCents: amount, overdue: true, patient: { id: "p1", fullName: "ANA", status: "INATIVO" } }],
    });
    const pageQuery = tx.$queryRaw.mock.calls[1][0] as Prisma.Sql;
    expect(pageQuery.values).toEqual(expect.arrayContaining([20, 40]));
    expect(pageQuery.sql).toContain('ORDER BY c."dueDate" ASC, c."createdAt" ASC, c."id" ASC');
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
  });

  it("recebimentos devolvem vínculo de substituição e somam sem conversão para Number", async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ total: BigInt(21), receivedCents: amount.toString() }]).mockResolvedValueOnce([{
      ...patientColumns, id: "pmt1", chargeId: "c1", receivedOn: new Date("2026-10-06"), amountCents: BigInt(123),
      description: "Sessão", replacesPaymentId: "original", createdById: "autor não deve sair",
    }]);
    const result = await readReceiptsReport(client, { start: "2026-10-06", end: "2026-10-06", page: 2 });
    expect(result).toMatchObject({ total: 21, page: 2, pageCount: 2, totals: { receivedCents: amount } });
    expect(result.items).toEqual([{ id: "pmt1", chargeId: "c1", receivedOn: new Date("2026-10-06"), amountCents: BigInt(123), description: "Sessão", replacesPaymentId: "original", patient: { id: "p1", fullName: "ANA", status: "INATIVO" } }]);
    const [sumQuery, pageQuery] = tx.$queryRaw.mock.calls.map(([query]) => query as Prisma.Sql);
    for (const query of [sumQuery, pageQuery]) {
      expect(query.sql).toContain('p."receivedOn" >= ?::date');
      expect(query.sql).toContain('p."receivedOn" <= ?::date');
      expect(query.sql).toContain('NOT EXISTS (SELECT 1 FROM "PaymentReversal"');
      expect(query.sql).not.toContain('c."status"');
    }
    expect(pageQuery.values).toEqual(["2026-10-06", "2026-10-06", 20, 20]);
  });

  it.each([
    ["2026-10-06T02:59:59.999Z", "2026-10-05"], ["2026-10-06T03:00:00.000Z", "2026-10-06"],
  ])("vence hoje sem atraso e usa dia São Paulo em %s", async (now, today) => {
    tx.$queryRaw.mockResolvedValueOnce([aggregate]).mockResolvedValueOnce([]);
    await readReceivablesReport(client, { start: "2026-10-01", end: "2026-10-07", page: 1 }, new Date(now));
    for (const [query] of tx.$queryRaw.mock.calls) {
      expect(query.values).toContain(today);
      expect(query.sql).toContain('"dueDate" < ?::date');
      expect(query.sql).toContain('c."dueDate" >= ?::date');
      expect(query.sql).toContain('c."dueDate" <= ?::date');
      expect(query.sql).toContain('c."status" = \'ATIVA\'');
      expect(query.sql).toContain('"balanceCents" > 0');
    }
  });

  it("vazio soma zero e fica na primeira página", async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ total: BigInt(0), receivedCents: "0" }]).mockResolvedValueOnce([]);
    expect(await readReceiptsReport(client, { page: 999 })).toMatchObject({ items: [], total: 0, page: 1, pageCount: 1, totals: { receivedCents: BigInt(0) } });
  });

  it("termina agregação antes de consultar a página na mesma conexão", async () => {
    let finishAggregate!: (value: typeof aggregate[]) => void;
    const aggregatePending = new Promise<typeof aggregate[]>((resolve) => { finishAggregate = resolve; });
    let started!: () => void;
    const notified = new Promise<void>((resolve) => { started = resolve; });
    tx.$queryRaw.mockImplementationOnce(() => { started(); return aggregatePending; }).mockResolvedValueOnce([]);
    const pending = readReceivablesReport(client, { page: 1 });
    await notified;
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    finishAggregate([aggregate]);
    await pending;
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
