// FIN-03 (#88): consultas reais em PostgreSQL descartável já migrado. Os dados são fictícios e
// isolados por paciente. A corrida pausa o leitor depois do agregado e confirma uma escrita em
// outra conexão antes de ler os itens; o controle READ COMMITTED reproduz a inconsistência.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { cancelCharge, createCharge } from "@/modules/financeiro/service";
import { createPayment, replacePayment, reversePayment } from "@/modules/financeiro/payment-service";
import { todayInSaoPaulo } from "@/modules/financeiro/payment-validation";
import { readReceiptsReport, readReceivablesReport } from "@/modules/financeiro/report-read";
import { REPORT_MESSAGES, REPORT_PAGE_SIZE, type ReportFilters } from "@/modules/financeiro/report-validation";

const url = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !url) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

describe("relatórios financeiros no PostgreSQL (#88)", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let db: PrismaClient;
  let writer: PrismaClient;
  let actor: string;
  let seq = 0;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const key = () => `fin03-${suffix}-${++seq}`;
  const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
  const now = new Date("2026-10-07T12:00:00.000Z");
  const sum = (values: bigint[]) => values.reduce((total, value) => total + value, BigInt(0));
  const zeroReceivables = { chargedCents: BigInt(0), receivedCents: BigInt(0), balanceCents: BigInt(0), overdueCents: BigInt(0) };
  const filters = (patientId: string, extra: Partial<ReportFilters> = {}): ReportFilters => ({ patientId, page: 1, ...extra });
  const patient = async (status: "ATIVO" | "INATIVO" = "ATIVO") => (await db.patient.create({
    data: { fullName: `PACIENTE FICTICIO FIN03 ${++seq}`, birthDate: date("1990-01-01"), phone: "11999999999", status, createdById: actor, updatedById: actor },
    select: { id: true },
  })).id;
  const charge = async (patientId: string, amountCents = 10_000, dueDate = "2026-01-01") => (await createCharge(db, actor, {
    patientId, amountCents, dueDate: date(dueDate), description: "Cobrança administrativa fictícia FIN03", requestId: key(),
  })).id;
  const pay = async (chargeId: string, amountCents: number, receivedOn = "2026-01-10", client = db) => (await createPayment(client, actor, {
    chargeId, amountCents, receivedOn: date(receivedOn), requestId: key(),
  }, { now })).id;
  const reverse = async (paymentId: string, reversedOn = "2026-03-10", client = db) => reversePayment(client, actor, {
    paymentId, reversedOn: date(reversedOn), reason: "Estorno interno fictício para validar relatório", requestId: key(),
  }, { now });

  before(async () => {
    // Dois adapters criam pools independentes: a escrita da corrida não usa a transação leitora.
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    writer = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    actor = (await db.user.create({
      data: { name: "ADMIN FIN03 FICTICIO", email: `fin03-${suffix}@example.test`, passwordHash: "x", role: "ADMIN" },
      select: { id: true },
    })).id;
  });
  after(async () => { await writer?.$disconnect(); await db?.$disconnect(); });

  it("R$100 recebidos em R$30 + R$70 aparecem uma vez; estorno remove o original do período e reabre o saldo", async () => {
    const patientId = await patient();
    const chargeId = await charge(patientId);
    const first = await pay(chargeId, 3_000, "2026-01-10");
    const original = await db.payment.findUniqueOrThrow({ where: { id: first } });
    const partial = await readReceivablesReport(db, filters(patientId), now);
    assert.equal(partial.error, null);
    assert.equal(partial.total, 1);
    assert.equal(partial.items.length, 1);
    assert.equal(partial.items[0].id, chargeId);
    assert.equal(partial.items[0].amountCents, BigInt(10_000));
    assert.equal(partial.items[0].receivedCents, BigInt(3_000));
    assert.equal(partial.items[0].balanceCents, BigInt(7_000));
    assert.deepEqual(partial.totals, { chargedCents: BigInt(10_000), receivedCents: BigInt(3_000), balanceCents: BigInt(7_000), overdueCents: BigInt(7_000) });

    const second = await pay(chargeId, 7_000, "2026-01-31");
    const paid = await readReceivablesReport(db, filters(patientId), now);
    assert.equal(paid.total, 0);
    assert.deepEqual(paid.items, []);
    assert.deepEqual(paid.totals, zeroReceivables);
    const receipts = await readReceiptsReport(db, filters(patientId, { start: "2026-01-01", end: "2026-01-31" }));
    assert.equal(receipts.total, 2);
    assert.deepEqual(new Set(receipts.items.map((item) => item.id)), new Set([first, second]));
    assert.equal(receipts.totals.receivedCents, BigInt(10_000));

    await reverse(first);
    const originalPeriod = await readReceiptsReport(db, filters(patientId, { start: "2026-01-01", end: "2026-01-31" }));
    assert.equal(originalPeriod.total, 1);
    assert.equal(originalPeriod.items[0].id, second);
    assert.equal(originalPeriod.totals.receivedCents, BigInt(7_000));
    const reversalPeriod = await readReceiptsReport(db, filters(patientId, { start: "2026-03-01", end: "2026-03-31" }));
    assert.equal(reversalPeriod.total, 0);
    assert.deepEqual(reversalPeriod.items, []);
    assert.equal(reversalPeriod.totals.receivedCents, BigInt(0));
    const reopened = await readReceivablesReport(db, filters(patientId), now);
    assert.equal(reopened.total, 1);
    assert.equal(reopened.items[0].receivedCents, BigInt(7_000));
    assert.equal(reopened.items[0].balanceCents, BigInt(3_000));
    assert.deepEqual(reopened.totals, { chargedCents: BigInt(10_000), receivedCents: BigInt(7_000), balanceCents: BigInt(3_000), overdueCents: BigInt(3_000) });
    assert.deepEqual(await db.payment.findUniqueOrThrow({ where: { id: first } }), original);
    assert.equal(await db.paymentReversal.count({ where: { paymentId: first } }), 1);
    assert.equal((await db.charge.findUniqueOrThrow({ where: { id: chargeId } })).status, "ATIVA");
  });

  it("canceladas e quitadas não entram nas contas; vários pagamentos não duplicam o cobrado", async () => {
    const patientId = await patient();
    const open = await charge(patientId, 101);
    await pay(open, 1);
    await pay(open, 33);
    const paid = await charge(patientId, 999);
    await pay(paid, 999);
    const cancelled = await charge(patientId, 5_000);
    const cancelledPayment = await pay(cancelled, 2_000);
    await reverse(cancelledPayment);
    await cancelCharge(db, actor, { chargeId: cancelled, reason: "Cobrança fictícia cancelada" });

    const result = await readReceivablesReport(db, filters(patientId), now);
    assert.equal(result.total, 1);
    assert.deepEqual(result.items.map((item) => item.id), [open]);
    assert.deepEqual(result.totals, { chargedCents: BigInt(101), receivedCents: BigInt(34), balanceCents: BigInt(67), overdueCents: BigInt(67) });
    const receipts = await readReceiptsReport(db, filters(patientId));
    assert.equal(receipts.total, 3);
    assert.equal(receipts.totals.receivedCents, BigInt(1_033));
    assert.ok(receipts.items.every((item) => item.chargeId !== cancelled));
  });

  it("períodos são inclusivos: contas usam vencimento e recebimentos usam a data efetiva, com atraso pelo dia de São Paulo", async () => {
    const patientId = await patient();
    const beforeStart = await charge(patientId, 10_100, "2025-12-31");
    const onStart = await charge(patientId, 20_300, "2026-01-01");
    const onEnd = await charge(patientId, 30_700, "2026-01-31");
    const afterEnd = await charge(patientId, 40_900, "2026-02-01");
    const first = await pay(beforeStart, 111, "2026-01-01");
    await pay(onStart, 222, "2026-02-01");
    const last = await pay(onEnd, 333, "2026-01-31");
    await pay(afterEnd, 444, "2025-12-31");
    const period = filters(patientId, { start: "2026-01-01", end: "2026-01-31" });
    const lastInstantOfJanuary = new Date("2026-02-01T02:59:59.999Z");
    const firstInstantOfFebruary = new Date("2026-02-01T03:00:00.000Z");
    assert.equal(todayInSaoPaulo(lastInstantOfJanuary), "2026-01-31");
    assert.equal(todayInSaoPaulo(firstInstantOfFebruary), "2026-02-01");
    const accounts = await readReceivablesReport(db, period, lastInstantOfJanuary);
    assert.deepEqual(accounts.items.map((item) => item.id), [onStart, onEnd]);
    assert.deepEqual(accounts.items.map((item) => item.overdue), [true, false]);
    assert.deepEqual(accounts.totals, { chargedCents: BigInt(51_000), receivedCents: BigInt(555), balanceCents: BigInt(50_445), overdueCents: BigInt(20_078) });
    const nextDay = await readReceivablesReport(db, period, firstInstantOfFebruary);
    assert.ok(nextDay.items.every((item) => item.overdue));
    assert.equal(nextDay.totals.overdueCents, BigInt(50_445));
    const receipts = await readReceiptsReport(db, period);
    assert.deepEqual(receipts.items.map((item) => item.id), [last, first]);
    assert.equal(receipts.totals.receivedCents, BigInt(444));
    const startOnly = await readReceiptsReport(db, filters(patientId, { start: "2026-01-31" }));
    assert.equal(startOnly.total, 2);
    assert.equal(startOnly.totals.receivedCents, BigInt(555));
    const endOnly = await readReceivablesReport(db, filters(patientId, { end: "2025-12-31" }), now);
    assert.deepEqual(endOnly.items.map((item) => item.id), [beforeStart]);
  });

  it("filtra paciente inativo e inclui todos os pacientes sem ampliar a projeção do cadastro", async () => {
    const active = await patient();
    const inactive = await patient("INATIVO");
    const allFilters = { start: "2003-11-11", end: "2003-11-11", page: 1 };
    const baselineAccounts = await readReceivablesReport(db, allFilters, now);
    const baselineReceipts = await readReceiptsReport(db, allFilters);
    const activeCharge = await charge(active, 501, "2003-11-11");
    const inactiveCharge = await charge(inactive, 703, "2003-11-11");
    await pay(activeCharge, 101, "2003-11-11");
    const inactiveReceipt = await pay(inactiveCharge, 203, "2003-11-11");
    const filteredAccounts = await readReceivablesReport(db, filters(inactive), now);
    assert.equal(filteredAccounts.patient?.id, inactive);
    assert.equal(filteredAccounts.patient?.status, "INATIVO");
    assert.deepEqual(Object.keys(filteredAccounts.patient!).sort(), ["fullName", "id", "status"]);
    assert.deepEqual(filteredAccounts.items.map((item) => item.id), [inactiveCharge]);
    assert.equal(filteredAccounts.items[0].patient.status, "INATIVO");
    assert.equal(filteredAccounts.totals.balanceCents, BigInt(500));
    const filteredReceipts = await readReceiptsReport(db, filters(inactive));
    assert.deepEqual(filteredReceipts.items.map((item) => item.id), [inactiveReceipt]);
    assert.deepEqual(Object.keys(filteredReceipts.items[0].patient).sort(), ["fullName", "id", "status"]);
    const allAccounts = await readReceivablesReport(db, allFilters, now);
    assert.equal(allAccounts.patient, null);
    assert.equal(allAccounts.total, baselineAccounts.total + 2);
    assert.equal(allAccounts.totals.chargedCents, baselineAccounts.totals.chargedCents + BigInt(1_204));
    assert.equal(allAccounts.totals.receivedCents, baselineAccounts.totals.receivedCents + BigInt(304));
    assert.equal(allAccounts.totals.balanceCents, baselineAccounts.totals.balanceCents + BigInt(900));
    const allReceipts = await readReceiptsReport(db, allFilters);
    assert.equal(allReceipts.total, baselineReceipts.total + 2);
    assert.equal(allReceipts.totals.receivedCents, baselineReceipts.totals.receivedCents + BigInt(304));
    assert.equal((await db.patient.findUniqueOrThrow({ where: { id: inactive } })).status, "INATIVO");
  });

  it("correção conserva o original e os vínculos; relatórios usam apenas a substituta no período efetivo", async () => {
    const patientId = await patient();
    const chargeId = await charge(patientId);
    const originalId = await pay(chargeId, 3_000, "2026-01-10");
    const otherId = await pay(chargeId, 4_000, "2026-01-20");
    const original = await db.payment.findUniqueOrThrow({ where: { id: originalId } });
    const corrected = await replacePayment(db, actor, {
      paymentId: originalId, amountCents: 2_500, receivedOn: date("2026-02-10"), reversedOn: date("2026-02-10"),
      reason: "Correção fictícia do recebimento", requestId: key(),
    }, { now });
    const savedReversal = await db.paymentReversal.findUniqueOrThrow({ where: { paymentId: originalId } });
    const savedCorrection = await db.payment.findUniqueOrThrow({ where: { id: corrected.id } });
    const january = await readReceiptsReport(db, filters(patientId, { start: "2026-01-01", end: "2026-01-31" }));
    assert.deepEqual(january.items.map((item) => item.id), [otherId]);
    assert.equal(january.totals.receivedCents, BigInt(4_000));
    const february = await readReceiptsReport(db, filters(patientId, { start: "2026-02-01", end: "2026-02-28" }));
    assert.equal(february.total, 1);
    assert.equal(february.items[0].id, corrected.id);
    assert.equal(february.items[0].replacesPaymentId, originalId);
    assert.equal(february.totals.receivedCents, BigInt(2_500));
    const accounts = await readReceivablesReport(db, filters(patientId), now);
    assert.deepEqual(accounts.totals, { chargedCents: BigInt(10_000), receivedCents: BigInt(6_500), balanceCents: BigInt(3_500), overdueCents: BigInt(3_500) });
    assert.equal(savedCorrection.chargeId, chargeId);
    assert.equal(savedCorrection.replacesPaymentId, originalId);
    assert.deepEqual(await db.payment.findUniqueOrThrow({ where: { id: originalId } }), original);
    assert.deepEqual(await db.paymentReversal.findUniqueOrThrow({ where: { paymentId: originalId } }), savedReversal);
    assert.deepEqual(await db.payment.findUniqueOrThrow({ where: { id: corrected.id } }), savedCorrection);
    assert.equal(await db.payment.count({ where: { chargeId } }), 3);
  });

  it("47 cobranças e 94 recebimentos têm totais globais exatos acima de Int32, páginas estáveis e última página limitada", async () => {
    const patientId = await patient();
    const expectedCharges: { id: string; amount: bigint; received: bigint; balance: bigint }[] = [];
    const expectedReceipts: { id: string; amount: bigint }[] = [];
    for (let index = 0; index < 47; index++) {
      const amount = 99_999_999 - index;
      const first = 33_333_333 + index % 7;
      const second = 16_666_667 + index;
      const chargeId = await charge(patientId, amount, `2026-01-${10 + index % 3}`);
      const firstId = await pay(chargeId, first, "2026-01-10");
      const secondId = await pay(chargeId, second, "2026-01-11");
      expectedCharges.push({ id: chargeId, amount: BigInt(amount), received: BigInt(first + second), balance: BigInt(amount - first - second) });
      expectedReceipts.push({ id: firstId, amount: BigInt(first) }, { id: secondId, amount: BigInt(second) });
    }
    // Esperado vem dos valores do fixture, não de uma segunda implementação da soma SQL.
    const charged = sum(expectedCharges.map((item) => item.amount));
    const received = sum(expectedReceipts.map((item) => item.amount));
    const balance = sum(expectedCharges.map((item) => item.balance));
    for (const value of [charged, received, balance]) assert.ok(value > BigInt(2_147_483_647));
    const totals = { chargedCents: charged, receivedCents: received, balanceCents: balance, overdueCents: balance };
    const storedCharges = await db.charge.findMany({ where: { patientId }, select: { id: true, dueDate: true, createdAt: true } });
    const storedReceipts = await db.payment.findMany({ where: { charge: { patientId } }, select: { id: true, receivedOn: true, createdAt: true } });
    const byId = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
    const orderedCharges = storedCharges.sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime()
      || left.createdAt.getTime() - right.createdAt.getTime() || byId(left.id, right.id)).map((item) => item.id);
    const orderedReceipts = storedReceipts.sort((left, right) => right.receivedOn.getTime() - left.receivedOn.getTime()
      || right.createdAt.getTime() - left.createdAt.getTime() || byId(right.id, left.id)).map((item) => item.id);
    const chargeIds: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const report = await readReceivablesReport(db, filters(patientId, { page }), now);
      assert.equal(report.error, null);
      assert.equal(report.total, 47);
      assert.equal(report.page, page);
      assert.equal(report.pageCount, 3);
      assert.equal(report.pageSize, REPORT_PAGE_SIZE);
      assert.equal(report.items.length, page === 3 ? 7 : 20);
      assert.deepEqual(report.totals, totals);
      assert.deepEqual(report.items.map((item) => item.id), orderedCharges.slice((page - 1) * 20, page * 20));
      for (const item of report.items) {
        const expected = expectedCharges.find((candidate) => candidate.id === item.id)!;
        assert.equal(item.amountCents, expected.amount);
        assert.equal(item.receivedCents, expected.received);
        assert.equal(item.balanceCents, expected.balance);
      }
      chargeIds.push(...report.items.map((item) => item.id));
    }
    assert.equal(new Set(chargeIds).size, 47);
    const lastCharges = await readReceivablesReport(db, filters(patientId, { page: 999 }), now);
    assert.equal(lastCharges.page, 3);
    assert.deepEqual(lastCharges.items.map((item) => item.id), orderedCharges.slice(40));
    assert.deepEqual(lastCharges.totals, totals);
    const receiptIds: string[] = [];
    for (let page = 1; page <= 5; page++) {
      const report = await readReceiptsReport(db, filters(patientId, { page }));
      assert.equal(report.total, 94);
      assert.equal(report.page, page);
      assert.equal(report.pageCount, 5);
      assert.equal(report.items.length, page === 5 ? 14 : 20);
      assert.equal(report.totals.receivedCents, received);
      assert.deepEqual(report.items.map((item) => item.id), orderedReceipts.slice((page - 1) * 20, page * 20));
      for (const item of report.items) assert.equal(item.amountCents, expectedReceipts.find((candidate) => candidate.id === item.id)!.amount);
      receiptIds.push(...report.items.map((item) => item.id));
    }
    assert.equal(new Set(receiptIds).size, 94);
    const lastReceipts = await readReceiptsReport(db, filters(patientId, { page: 999 }));
    assert.equal(lastReceipts.page, 5);
    assert.deepEqual(lastReceipts.items.map((item) => item.id), orderedReceipts.slice(80));
    assert.equal(lastReceipts.totals.receivedCents, received);
    const firstAgain = await readReceiptsReport(db, filters(patientId));
    assert.deepEqual(firstAgain.items.map((item) => item.id), orderedReceipts.slice(0, 20));
  });

  it("período vazio e paciente sem lançamentos têm zeros e página 1; paciente inexistente retorna erro sem ampliar o filtro", async () => {
    const patientId = await patient();
    for (const report of [await readReceivablesReport(db, filters(patientId, { page: 999 }), now), await readReceiptsReport(db, filters(patientId, { page: 999 }))]) {
      assert.equal(report.error, null);
      assert.equal(report.patient?.id, patientId);
      assert.equal(report.total, 0);
      assert.equal(report.page, 1);
      assert.equal(report.pageCount, 1);
      assert.deepEqual(report.items, []);
      assert.ok(Object.values(report.totals).every((value) => value === BigInt(0)));
    }
    await charge(patientId);
    const emptyPeriod = await readReceivablesReport(db, filters(patientId, { start: "2026-02-01", end: "2026-02-28", page: 2 }), now);
    assert.equal(emptyPeriod.total, 0);
    assert.equal(emptyPeriod.page, 1);
    assert.deepEqual(emptyPeriod.totals, zeroReceivables);
    const missingFilters = filters(`fin03-missing-${suffix}`, { page: 9 });
    for (const report of [await readReceivablesReport(db, missingFilters, now), await readReceiptsReport(db, missingFilters)]) {
      assert.equal(report.error, REPORT_MESSAGES.patientNotFound);
      assert.deepEqual(report.filters, missingFilters);
      assert.equal(report.patient, null);
      assert.equal(report.total, 0);
      assert.equal(report.page, 1);
      assert.deepEqual(report.items, []);
      assert.ok(Object.values(report.totals).every((value) => value === BigInt(0)));
    }
  });

  type ReportKind = "contas" | "recebimentos";
  type ReadDb = Pick<PrismaClient, "$transaction">;
  async function readSnapshot(kind: ReportKind, reader: ReadDb, patientId: string) {
    if (kind === "contas") {
      const report = await readReceivablesReport(reader, filters(patientId), now);
      return { error: report.error, total: report.total, aggregate: report.totals.balanceCents,
        itemSum: sum(report.items.map((item) => item.balanceCents)), ids: report.items.map((item) => item.id) };
    }
    const report = await readReceiptsReport(reader, filters(patientId));
    return { error: report.error, total: report.total, aggregate: report.totals.receivedCents,
      itemSum: sum(report.items.map((item) => item.amountCents)), ids: report.items.map((item) => item.id) };
  }

  function readerWithBarrier(writeAfterAggregate: () => Promise<unknown>, forceReadCommitted: boolean) {
    let commands = 0;
    let committed = false;
    type Options = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };
    const transaction = async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>, options?: Options): Promise<T> => {
      assert.equal(options?.isolationLevel, "RepeatableRead");
      return db.$transaction(async (tx) => {
        const intercepted = new Proxy(tx, {
          get(target, property, receiver) {
            if (property === "$queryRaw") return async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
              const result = await target.$queryRaw(query, ...values);
              commands++;
              if (commands === 1) {
                const sql = "strings" in query ? query.strings.join("") : query.join("");
                assert.match(sql, /SELECT COUNT\(\*\)/, "A barreira deve ocorrer depois do agregado SQL real.");
                // Await só retorna quando a transação da OUTRA conexão já confirmou a escrita.
                await writeAfterAggregate();
                committed = true;
              }
              return result;
            };
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        return callback(intercepted);
      }, { ...options, timeout: 15_000, ...(forceReadCommitted ? { isolationLevel: "ReadCommitted" as const } : {}) });
    };
    const reader = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "$transaction") return transaction;
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return { reader, assertBarrier() { assert.equal(commands, 2); assert.equal(committed, true); } };
  }

  for (const kind of ["contas", "recebimentos"] as const) {
    for (const operation of ["pagamento", "estorno"] as const) {
      it(`${kind}: snapshot único quando ${operation} confirma entre total e itens; READ COMMITTED reproduz a incompatibilidade`, async () => {
        for (const forceReadCommitted of [false, true]) {
          const patientId = await patient();
          const chargeId = await charge(patientId);
          const originalId = await pay(chargeId, 3_000);
          const beforeWrite = await readSnapshot(kind, db, patientId);
          assert.equal(beforeWrite.aggregate, beforeWrite.itemSum);
          const barrier = readerWithBarrier(
            () => operation === "pagamento" ? pay(chargeId, 2_000, "2026-01-11", writer) : reverse(originalId, "2026-03-10", writer),
            forceReadCommitted,
          );
          const duringWrite = await readSnapshot(kind, barrier.reader, patientId);
          barrier.assertBarrier();
          const afterWrite = await readSnapshot(kind, db, patientId);
          assert.equal(afterWrite.aggregate, afterWrite.itemSum);
          assert.notEqual(afterWrite.aggregate, beforeWrite.aggregate, "A escrita concorrente precisa alterar o estado real.");
          if (forceReadCommitted) {
            assert.equal(duringWrite.aggregate, beforeWrite.aggregate);
            assert.equal(duringWrite.itemSum, afterWrite.itemSum);
            assert.deepEqual(duringWrite.ids, afterWrite.ids);
            assert.notEqual(duringWrite.aggregate, duringWrite.itemSum, "O controle precisa detectar snapshots incompatíveis.");
          } else {
            assert.deepEqual(duringWrite, beforeWrite, "O relatório deve conservar o snapshot anterior ao COMMIT concorrente.");
          }
        }
      });
    }
  }
});
