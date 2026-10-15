// FIN-02: mesmos serviços usados pelas actions, contra PostgreSQL descartável real.
// As corridas seguram a primeira transação antes do commit e observam a segunda no lock;
// nenhum retry transforma uma operação incompatível em sucesso.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ChargeRuleError, HAS_VALID_PAYMENTS, cancelCharge, createCharge, replaceCharge } from "@/modules/financeiro/service";
import { CHARGE_CANCELLED, PAYMENT_EXCEEDS_BALANCE, PAYMENT_KEY_MISMATCH, PaymentRuleError, createPayment, reversePayment, replacePayment } from "@/modules/financeiro/payment-service";

const url = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !url) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

describe("pagamentos e estornos no PostgreSQL (#87)", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let db: PrismaClient;
  let raw: Client;
  let actor: string;
  let otherActor: string;
  let patient: string;
  let otherPatient: string;
  let seq = 0;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const key = () => `fin02-${suffix}-${++seq}`;
  const date = (value = "2026-01-02") => new Date(`${value}T00:00:00.000Z`);
  const receipt = (chargeId: string, amountCents = 3_000, requestId = key()) => ({ chargeId, amountCents, receivedOn: date(), requestId });
  const reversal = (paymentId: string, requestId = key()) => ({ paymentId, reason: "Recebimento lançado incorretamente", reversedOn: date("2026-01-03"), requestId });
  const correction = (paymentId: string, amountCents = 2_500, requestId = key()) => ({
    ...reversal(paymentId, requestId), amountCents, receivedOn: date(),
  });
  const charge = async (amountCents = 10_000) => (await createCharge(db, actor, {
    patientId: patient, description: "Cobrança fictícia FIN-02", amountCents, dueDate: date("2026-01-01"), requestId: key(),
  })).id;
  const balance = async (chargeId: string) => {
    const value = await db.charge.findUniqueOrThrow({ where: { id: chargeId }, select: { amountCents: true } });
    const payments = await db.payment.aggregate({ where: { chargeId, reversal: null }, _sum: { amountCents: true } });
    return value.amountCents - (payments._sum.amountCents ?? 0);
  };
  const snapshot = (chargeId: string) => db.charge.findUniqueOrThrow({
    where: { id: chargeId }, include: { payments: { orderBy: { id: "asc" }, include: { reversal: true } } },
  });
  const refused = (promise: Promise<unknown>) => assert.rejects(promise,
    (error: unknown) => error instanceof PaymentRuleError || error instanceof ChargeRuleError);
  const sqlState = async (sql: string, params: unknown[] = []) => raw.query(sql, params).then(() => "ok", (error: { code?: string }) => error.code);

  before(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    raw = new Client({ connectionString: url });
    await raw.connect();
    actor = (await db.user.create({ data: { name: "ADMIN FIN02", email: `fin02-${suffix}@example.test`, role: "ADMIN", passwordHash: "x" } })).id;
    otherActor = (await db.user.create({ data: { name: "RECEPCAO FIN02", email: `fin02-other-${suffix}@example.test`, role: "RECEPCAO", passwordHash: "x" } })).id;
    patient = (await db.patient.create({ data: {
      fullName: "PACIENTE FICTICIO FIN02", birthDate: date("1990-01-01"), phone: "11999999999", createdById: actor, updatedById: actor,
    } })).id;
    otherPatient = (await db.patient.create({ data: {
      fullName: "PACIENTE FICTICIO FIN02 INATIVO", birthDate: date("1990-01-01"), phone: "11999999999", status: "INATIVO", createdById: actor, updatedById: actor,
    } })).id;
  });
  after(async () => { await raw?.end(); await db?.$disconnect(); });

  it("R$100 recebe R$30 + R$70 em centavos exatos; estorno reabre e novo pagamento quita", async () => {
    const id = await charge();
    const first = await createPayment(db, actor, receipt(id));
    assert.equal(await balance(id), 7_000);
    await createPayment(db, otherActor, receipt(id, 7_000));
    assert.equal(await balance(id), 0);
    const original = await db.payment.findUniqueOrThrow({ where: { id: first.id } });
    const input = reversal(first.id);
    const reversed = await reversePayment(db, otherActor, input);
    assert.equal(reversed.alreadyReversed, false);
    assert.equal(await balance(id), 3_000);
    assert.deepEqual(await reversePayment(db, actor, input), { id: reversed.id, alreadyReversed: true });
    assert.equal(await balance(id), 3_000);
    await createPayment(db, otherActor, receipt(id));
    assert.equal(await balance(id), 0);
    assert.deepEqual(await db.payment.findUniqueOrThrow({ where: { id: first.id } }), original);
    const hundred = await charge(101);
    await createPayment(db, actor, receipt(hundred, 33));
    await createPayment(db, actor, receipt(hundred, 68));
    assert.equal(await balance(hundred), 0);
  });

  it("valores/datas/estado inválidos não deixam pagamento nem estorno parcial", async () => {
    const id = await charge(100);
    const before = await snapshot(id);
    for (const amountCents of [0, -1, 1.5, 101]) await refused(createPayment(db, actor, receipt(id, amountCents)));
    for (const receivedOn of [new Date("invalid"), date("1999-12-31"), date("2101-01-01"), date("2099-01-01")]) {
      await refused(createPayment(db, actor, { ...receipt(id, 50), receivedOn }));
    }
    await refused(createPayment(db, actor, receipt("inexistente-fin02", 50)));
    assert.deepEqual(await snapshot(id), before);
    const paid = await createPayment(db, actor, receipt(id, 50));
    const paidState = await snapshot(id);
    for (const reversedOn of [new Date("invalid"), date("2026-01-01"), date("2099-01-01")]) {
      await refused(reversePayment(db, actor, { ...reversal(paid.id), reversedOn }));
    }
    await refused(reversePayment(db, actor, { ...reversal(paid.id), reason: "  " }));
    await refused(reversePayment(db, actor, reversal("inexistente-fin02")));
    assert.deepEqual(await snapshot(id), paidState);
    const cancelled = await charge();
    await cancelCharge(db, actor, { chargeId: cancelled, reason: "Cobrança indevida" });
    const cancelledState = await snapshot(cancelled);
    await refused(createPayment(db, actor, receipt(cancelled)));
    assert.deepEqual(await snapshot(cancelled), cancelledState);
  });

  it("cancelar/substituir exige estornar todos; cancelar preserva pagamentos e estornos", async () => {
    const id = await charge();
    const first = await createPayment(db, actor, receipt(id));
    const second = await createPayment(db, actor, receipt(id, 2_000));
    await refused(cancelCharge(db, actor, { chargeId: id, reason: "Teste" }));
    await refused(replaceCharge(db, actor, {
      chargeId: id, patientId: otherPatient, description: "Substituição", amountCents: 10_000, dueDate: date(), reason: "Teste", requestId: key(),
    }));
    await reversePayment(db, otherActor, reversal(first.id));
    await refused(cancelCharge(db, actor, { chargeId: id, reason: "Teste" }));
    await reversePayment(db, otherActor, reversal(second.id));
    await cancelCharge(db, actor, { chargeId: id, reason: "Todos os recebimentos estornados" });
    const result = await snapshot(id);
    assert.equal(result.status, "CANCELADA");
    assert.equal(result.payments.length, 2);
    assert.ok(result.payments.every((payment) => payment.reversal));
  });

  it("correção mantém original/autores/datas/vínculo e desfaz estorno se novo valor exceder saldo", async () => {
    const id = await charge();
    const first = await createPayment(db, actor, receipt(id));
    await createPayment(db, actor, receipt(id, 6_000));
    const original = await db.payment.findUniqueOrThrow({ where: { id: first.id } });
    const before = await snapshot(id);
    const failed = correction(first.id, 5_000);
    await refused(replacePayment(db, otherActor, failed));
    assert.deepEqual(await snapshot(id), before);
    assert.equal(await db.paymentReversal.count({ where: { idempotencyKey: `CORRECAO:${failed.requestId}` } }), 0);
    const input = correction(first.id, 4_000);
    const result = await replacePayment(db, otherActor, input);
    assert.equal(result.created, true);
    assert.equal(await balance(id), 0);
    assert.deepEqual(await db.payment.findUniqueOrThrow({ where: { id: first.id } }), original);
    const replacement = await db.payment.findUniqueOrThrow({ where: { id: result.id }, include: { replaces: { include: { reversal: true } } } });
    assert.equal(replacement.chargeId, id);
    assert.equal(replacement.createdById, otherActor);
    assert.equal(replacement.replacesPaymentId, first.id);
    assert.equal(replacement.replaces?.createdById, actor);
    assert.equal(replacement.replaces?.reversal?.createdById, otherActor);
    assert.equal(replacement.replaces?.reversal?.reason, input.reason);
    assert.equal(replacement.replaces?.reversal?.reversedOn.getTime(), input.reversedOn.getTime());
    assert.deepEqual(await replacePayment(db, actor, input), { id: result.id, created: false });
    await refused(replacePayment(db, actor, { ...input, amountCents: 3_999 }));
    await refused(replacePayment(db, actor, { ...input, reason: "Outro motivo" }));
    await refused(replacePayment(db, actor, { ...input, reversedOn: date("2026-01-04") }));
    await refused(replacePayment(db, actor, correction(first.id, 3_000)));
    assert.equal(await db.payment.count({ where: { replacesPaymentId: first.id } }), 1);
  });

  it("reenvio consulta histórico antes do estado atual e chave incompatível nunca altera original", async () => {
    const id = await charge();
    const input = receipt(id);
    const first = await createPayment(db, actor, input);
    const reverseInput = reversal(first.id);
    const reverseResult = await reversePayment(db, actor, reverseInput);
    await cancelCharge(db, actor, { chargeId: id, reason: "Cancelada depois do estorno" });
    const before = await snapshot(id);
    assert.deepEqual(await createPayment(db, otherActor, input), { id: first.id, created: false });
    assert.deepEqual(await reversePayment(db, otherActor, reverseInput), { id: reverseResult.id, alreadyReversed: true });
    await refused(createPayment(db, actor, { ...input, amountCents: 3_001 }));
    await refused(createPayment(db, actor, { ...input, receivedOn: date("2026-01-01") }));
    await refused(reversePayment(db, actor, { ...reverseInput, reason: "Outro motivo" }));
    await refused(reversePayment(db, actor, { ...reverseInput, reversedOn: date("2026-01-04") }));
    assert.deepEqual(await snapshot(id), before);
  });

  it("reenvios simultâneos de recebimento, estorno e correção têm efeito único", async () => {
    const id = await charge();
    const input = receipt(id);
    const payments = await Promise.all(Array.from({ length: 5 }, () => createPayment(db, actor, input)));
    assert.equal(new Set(payments.map((result) => result.id)).size, 1);
    assert.equal(payments.filter((result) => result.created).length, 1);
    const reversalKey = key();
    const reversals = await Promise.all(Array.from({ length: 5 }, () => reversePayment(db, actor, reversal(payments[0].id, reversalKey))));
    assert.equal(new Set(reversals.map((result) => result.id)).size, 1);
    assert.equal(reversals.filter((result) => !result.alreadyReversed).length, 1);
    const paid = await createPayment(db, actor, receipt(id));
    const fix = correction(paid.id);
    const fixes = await Promise.all(Array.from({ length: 5 }, () => replacePayment(db, otherActor, fix)));
    assert.equal(new Set(fixes.map((result) => result.id)).size, 1);
    assert.equal(fixes.filter((result) => result.created).length, 1);
    assert.equal(await db.payment.count({ where: { replacesPaymentId: paid.id } }), 1);
    assert.equal(await db.paymentReversal.count({ where: { paymentId: paid.id } }), 1);
  });

  it("chave disputada com conteúdos distintos confirma só um e recusa os demais", async () => {
    const id = await charge();
    const requestId = key();
    const outcomes = await Promise.allSettled([1_000, 2_000, 3_000, 4_000].map((amount) => createPayment(db, actor, receipt(id, amount, requestId))));
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((result) => result.status === "rejected").length, 3);
    for (const result of outcomes) if (result.status === "rejected") {
      assert.ok(result.reason instanceof PaymentRuleError);
      assert.equal(result.reason.message, PAYMENT_KEY_MISMATCH);
    }
    assert.equal(await db.payment.count({ where: { idempotencyKey: `RECEBIMENTO:${requestId}` } }), 1);
    const saved = await db.payment.findUniqueOrThrow({ where: { idempotencyKey: `RECEBIMENTO:${requestId}` } });
    assert.equal(await balance(id), 10_000 - saved.amountCents);
    const other = await charge();
    await refused(createPayment(db, actor, receipt(other, saved.amountCents, requestId)));
    assert.equal(await db.payment.count({ where: { chargeId: other } }), 0);
  });

  it("correção reenviada após estorno e cancelamento mantém o resultado histórico", async () => {
    const id = await charge();
    const paid = await createPayment(db, actor, receipt(id));
    const input = correction(paid.id);
    const corrected = await replacePayment(db, otherActor, input);
    await reversePayment(db, actor, reversal(corrected.id));
    await cancelCharge(db, actor, { chargeId: id, reason: "Cancelada posteriormente" });
    const before = await snapshot(id);
    assert.deepEqual(await replacePayment(db, actor, input), { id: corrected.id, created: false });
    await refused(replacePayment(db, actor, { ...input, receivedOn: date("2026-01-01") }));
    assert.deepEqual(await snapshot(id), before);
  });

  // Intercepta só a fronteira da transação real: o SQL do serviço não é simulado.
  function holdTransaction() {
    let release!: () => void;
    let ready!: (pid: number) => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<number>((resolve) => { ready = resolve; });
    const proxy = new Proxy(db, {
      get(target, property) {
        if (property !== "$transaction") return Reflect.get(target, property, target);
        return (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: Parameters<typeof db.$transaction>[1]) =>
          target.$transaction(async (tx) => {
            const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
            try {
              const result = await operation(tx);
              ready(pid);
              await barrier;
              return result;
            } catch (error) {
              ready(pid);
              await barrier;
              throw error;
            }
          }, options);
      },
    });
    return { db: proxy, ready: started, release };
  }
  async function observeWait(pid: number) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const result = await raw.query(`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))
      ) AS waiting`, [pid]);
      if (result.rows[0].waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail("A segunda operação deveria aguardar a trava real da cobrança.");
  }
  async function race(first: (held: PrismaClient) => Promise<unknown>, second: () => Promise<unknown>) {
    const gate = holdTransaction();
    const firstOutcome = first(gate.db).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );
    const pid = await gate.ready;
    const secondOutcome = second().then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );
    try { await observeWait(pid); } finally { gate.release(); }
    return Promise.all([firstOutcome, secondOutcome]);
  }

  it("pagamentos disputando saldo, ambas ordens: o segundo relê o commit e recusa excesso", async () => {
    for (const amounts of [[7_000, 6_000], [6_000, 7_000]]) {
      const id = await charge();
      const outcomes = await race(
        (held) => createPayment(held, actor, receipt(id, amounts[0])),
        () => createPayment(db, otherActor, receipt(id, amounts[1])),
      );
      assert.equal(outcomes[0].status, "fulfilled");
      assert.equal(outcomes[1].status, "rejected");
      if (outcomes[1].status === "rejected") {
        assert.ok(outcomes[1].reason instanceof PaymentRuleError);
        assert.equal(outcomes[1].reason.message, PAYMENT_EXCEEDS_BALANCE);
      }
      assert.equal(await balance(id), 10_000 - amounts[0]);
      assert.equal(await db.payment.count({ where: { chargeId: id } }), 1);
    }
  });

  it("pagamento versus cancelamento, ambas ordens, nunca deixa cancelada com pagamento válido", async () => {
    for (const paymentFirst of [true, false]) {
      const id = await charge();
      const pay = (client: PrismaClient) => createPayment(client, actor, receipt(id));
      const cancel = (client: PrismaClient) => cancelCharge(client, otherActor, { chargeId: id, reason: "Teste de corrida" });
      const outcomes = await race(paymentFirst ? pay : cancel, () => (paymentFirst ? cancel(db) : pay(db)));
      assert.equal(outcomes[0].status, "fulfilled");
      assert.equal(outcomes[1].status, "rejected");
      if (outcomes[1].status === "rejected") {
        assert.ok(outcomes[1].reason instanceof (paymentFirst ? ChargeRuleError : PaymentRuleError));
        assert.ok(outcomes[1].reason instanceof Error);
        assert.equal(outcomes[1].reason.message, paymentFirst ? HAS_VALID_PAYMENTS : CHARGE_CANCELLED);
      }
      const result = await snapshot(id);
      assert.equal(result.status, paymentFirst ? "ATIVA" : "CANCELADA");
      assert.equal(result.payments.length, paymentFirst ? 1 : 0);
    }
  });

  it("estorno versus cancelamento, ambas ordens, só cancela depois do estorno confirmado", async () => {
    for (const reversalFirst of [true, false]) {
      const id = await charge();
      const paid = await createPayment(db, actor, receipt(id));
      const reverse = (client: PrismaClient) => reversePayment(client, actor, reversal(paid.id));
      const cancel = (client: PrismaClient) => cancelCharge(client, otherActor, { chargeId: id, reason: "Teste de corrida" });
      const outcomes = await race(reversalFirst ? reverse : cancel, () => (reversalFirst ? cancel(db) : reverse(db)));
      assert.equal(outcomes[0].status, reversalFirst ? "fulfilled" : "rejected");
      if (outcomes[0].status === "rejected") {
        assert.ok(outcomes[0].reason instanceof ChargeRuleError);
        assert.equal(outcomes[0].reason.message, HAS_VALID_PAYMENTS);
      }
      assert.equal(outcomes[1].status, "fulfilled");
      const result = await snapshot(id);
      assert.equal(result.status, reversalFirst ? "CANCELADA" : "ATIVA");
      assert.equal(result.payments.filter((payment) => !payment.reversal).length, 0);
      assert.equal(await balance(id), 10_000);
    }
  });

  it("estornos repetidos disputam a trava e recompõem uma vez", async () => {
    const id = await charge();
    const paid = await createPayment(db, actor, receipt(id));
    const input = reversal(paid.id);
    const outcomes = await race(
      (held) => reversePayment(held, actor, input),
      () => reversePayment(db, otherActor, input),
    );
    assert.ok(outcomes.every((result) => result.status === "fulfilled"));
    assert.equal(await db.paymentReversal.count({ where: { paymentId: paid.id } }), 1);
    assert.equal(await balance(id), 10_000);
  });

  it("SQL direto garante saldo/imutabilidade/datas/vínculos e preserva guards FIN-01", async () => {
    const id = await charge(100);
    const fingerprint = `v1:${"a".repeat(64)}`;
    const insert = `INSERT INTO "Payment" (id,"chargeId","amountCents","receivedOn","createdById","idempotencyKey",fingerprint,"replacesPaymentId")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`;
    const paymentData = (overrides: unknown[] = []) => [key(), id, 50, "2026-01-02", actor, `RECEBIMENTO:${key()}`, fingerprint, null, ...overrides];
    for (const change of [[2, 0], [2, -1], [2, 101], [3, "1999-12-31"], [3, "2099-01-01"], [5, "invalid"], [6, "invalid"]] as const) {
      const params = paymentData(); params[change[0]] = change[1];
      assert.equal(await sqlState(insert, params), "23514");
    }
    const params = paymentData();
    assert.equal(await sqlState(insert, params), "ok");
    const paymentId = String(params[0]);
    assert.equal(await sqlState(`UPDATE "Payment" SET "amountCents" = 49 WHERE id = $1`, [paymentId]), "23001");
    assert.equal(await sqlState(`DELETE FROM "Payment" WHERE id = $1`, [paymentId]), "23001");
    assert.equal(await sqlState(`UPDATE "Charge" SET status = 'CANCELADA', "cancelledAt" = now(), "cancelledById" = $2, "cancelReason" = 'x' WHERE id = $1`, [id, actor]), "23514");
    assert.equal(await sqlState(`UPDATE "Charge" SET description = 'Alterada' WHERE id = $1`, [id]), "23514");
    assert.equal(await sqlState(`DELETE FROM "Charge" WHERE id = $1`, [id]), "23001");
    const newCharge = await charge();
    const wrongReplacement = paymentData(); wrongReplacement[1] = newCharge; wrongReplacement[7] = paymentId;
    assert.equal(await sqlState(insert, wrongReplacement), "23514");
    const reverseSql = `INSERT INTO "PaymentReversal" (id,"paymentId",reason,"reversedOn","createdById","idempotencyKey",fingerprint)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`;
    const reverseData = () => [key(), paymentId, "Correção", "2026-01-03", otherActor, `ESTORNO:${key()}`, fingerprint];
    for (const change of [[2, " "], [3, "2026-01-01"], [3, "2099-01-01"], [5, "invalid"], [6, "invalid"]] as const) {
      const invalid = reverseData(); invalid[change[0]] = change[1];
      assert.equal(await sqlState(reverseSql, invalid), "23514");
    }
    const reverseParams = reverseData();
    assert.equal(await sqlState(reverseSql, reverseParams), "ok");
    assert.equal(await sqlState(reverseSql, reverseData()), "23505");
    assert.equal(await sqlState(`UPDATE "PaymentReversal" SET reason = 'Alterada' WHERE id = $1`, [reverseParams[0]]), "23001");
    assert.equal(await sqlState(`DELETE FROM "PaymentReversal" WHERE id = $1`, [reverseParams[0]]), "23001");
    assert.equal(await sqlState(insert, wrongReplacement), "23514"); // estornado, mas em outra cobrança
    assert.equal(await sqlState(`DELETE FROM "User" WHERE id = $1`, [otherActor]), "23001");
    await raw.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    try { assert.equal(await sqlState(insert, paymentData()), "23514"); } finally { await raw.query("ROLLBACK"); }
    const tables = await raw.query(`SELECT count(*)::int AS n FROM "Payment" WHERE "chargeId" = $1`, [id]);
    assert.equal(tables.rows[0].n, 1);
  });
});
