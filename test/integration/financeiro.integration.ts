// Integração das cobranças manuais (FIN-01, #86) com PostgreSQL real: constraints e triggers de
// imutabilidade, idempotência sob reenvio simultâneo, cancelamento repetido e concorrente,
// substituição atômica, contrato de pagamentos válidos para a FIN-02 e exclusão de usuário com
// vínculo financeiro. Usa o mesmo service.ts das actions. Só dados fictícios, em banco DESCARTÁVEL
// já migrado (INTEGRATION_DATABASE_URL); na CI é obrigatória.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { deleteDeactivatedUser, linkedMessage } from "@/modules/auth/users/delete";
import {
  ALREADY_CANCELLED,
  CHARGE_NOT_FOUND,
  ChargeRuleError,
  HAS_VALID_PAYMENTS,
  KEY_MISMATCH,
  PATIENT_NOT_FOUND,
  cancelCharge,
  createCharge,
  replaceCharge,
} from "@/modules/financeiro/service";

const url = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !url) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

describe("cobranças manuais no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let prisma: PrismaClient;
  let raw: Client;
  let other: Client;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let seq = 0;
  const users: Record<"ADMIN" | "RECEPCAO" | "FISIOTERAPEUTA", string> = { ADMIN: "", RECEPCAO: "", FISIOTERAPEUTA: "" };
  let activePatient: string;
  let inactivePatient: string;

  const key = () => `fin-${suffix}-${++seq}`.slice(0, 64);
  const data = (overrides: Partial<{ patientId: string; description: string; amountCents: number; dueDate: Date }> = {}) => ({
    patientId: activePatient,
    description: "Pacote fictício de 10 sessões",
    amountCents: 35_000,
    dueDate: new Date("2026-10-31T00:00:00.000Z"),
    ...overrides,
  });

  async function rejection(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (error) {
      if (error instanceof ChargeRuleError) return error.message;
      throw error;
    }
    throw new Error("Era esperada uma recusa.");
  }

  // Erro do PostgreSQL (SQLSTATE) em SQL direto, sem passar pela aplicação.
  async function sqlState(sql: string, params: unknown[] = []) {
    try {
      await raw.query(sql, params);
    } catch (error) {
      return (error as { code?: string }).code;
    }
    return "ok";
  }

  const row = (id: string) =>
    prisma.charge.findUniqueOrThrow({
      where: { id },
      select: {
        status: true,
        amountCents: true,
        cancelledAt: true,
        cancelledById: true,
        cancelReason: true,
        replacesChargeId: true,
        createdById: true,
      },
    });

  before(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    raw = new Client({ connectionString: url });
    await raw.connect();
    other = new Client({ connectionString: url });
    await other.connect();
    for (const role of ["ADMIN", "RECEPCAO", "FISIOTERAPEUTA"] as const) {
      const user = await prisma.user.create({
        data: { name: `FIN ${role}`, email: `fin-${role.toLowerCase()}-${suffix}@teste.local`, passwordHash: "x", role },
        select: { id: true },
      });
      users[role] = user.id;
    }
    const patient = (fullName: string, status: "ATIVO" | "INATIVO") =>
      prisma.patient.create({
        data: { fullName, birthDate: new Date("1990-01-01"), phone: "11999999999", status, createdById: users.ADMIN, updatedById: users.ADMIN },
        select: { id: true },
      });
    activePatient = (await patient("PACIENTE FICTICIO FINANCEIRO", "ATIVO")).id;
    inactivePatient = (await patient("PACIENTE FICTICIO INATIVO", "INATIVO")).id;
  });

  after(async () => {
    await other?.end();
    await raw?.end();
    await prisma?.$disconnect();
  });

  it("os três perfis lançam para qualquer paciente, inclusive inativo, com autoria e valor exato", async () => {
    for (const [role, actorId] of Object.entries(users)) {
      const patientId = role === "RECEPCAO" ? inactivePatient : activePatient;
      const result = await createCharge(prisma, actorId, { ...data({ patientId, amountCents: 1 }), requestId: key() });
      assert.equal(result.created, true);
      const saved = await row(result.id);
      assert.equal(saved.createdById, actorId);
      assert.equal(saved.amountCents, 1);
      assert.equal(saved.status, "ATIVA");
    }
    // O paciente inativo continua inativo: financeiro não reativa cadastro.
    assert.equal((await prisma.patient.findUniqueOrThrow({ where: { id: inactivePatient } })).status, "INATIVO");
  });

  it("paciente inexistente não cria lançamento", async () => {
    const requestId = key();
    assert.equal(await rejection(createCharge(prisma, users.ADMIN, { ...data({ patientId: "inexistente" }), requestId })), PATIENT_NOT_FOUND);
    assert.equal(await prisma.charge.count({ where: { idempotencyKey: requestId } }), 0);
  });

  it("o banco recusa valor não positivo, descrição vazia, paciente inexistente e cancelamento incoerente", async () => {
    const insert = `INSERT INTO "Charge" ("id","patientId","description","amountCents","dueDate","idempotencyKey","createdById")
                    VALUES ($1,$2,$3,$4,'2026-10-31',$5,$6)`;
    assert.equal(await sqlState(insert, [key(), activePatient, "x", 0, key(), users.ADMIN]), "23514");
    assert.equal(await sqlState(insert, [key(), activePatient, "x", -100, key(), users.ADMIN]), "23514");
    assert.equal(await sqlState(insert, [key(), activePatient, "   ", 100, key(), users.ADMIN]), "23514");
    assert.equal(await sqlState(insert, [key(), "inexistente", "x", 100, key(), users.ADMIN]), "23503");
    assert.equal(await sqlState(insert, [key(), activePatient, "x", 2_147_483_648, key(), users.ADMIN]), "22003");
    assert.equal(
      await sqlState(
        `INSERT INTO "Charge" ("id","patientId","description","amountCents","dueDate","idempotencyKey","createdById","status")
         VALUES ($1,$2,'x',100,'2026-10-31',$3,$4,'CANCELADA')`,
        [key(), activePatient, key(), users.ADMIN],
      ),
      "23514",
    );
  });

  it("cobrança é imutável: sem UPDATE de conteúdo, sem reabrir e sem DELETE", async () => {
    const { id } = await createCharge(prisma, users.ADMIN, { ...data(), requestId: key() });
    assert.equal(await sqlState(`UPDATE "Charge" SET "amountCents" = 1 WHERE "id" = $1`, [id]), "23514");
    assert.equal(await sqlState(`UPDATE "Charge" SET "patientId" = $2 WHERE "id" = $1`, [id, inactivePatient]), "23514");
    assert.equal(await sqlState(`UPDATE "Charge" SET "description" = 'outra' WHERE "id" = $1`, [id]), "23514");
    assert.equal(await sqlState(`DELETE FROM "Charge" WHERE "id" = $1`, [id]), "23001");
    await cancelCharge(prisma, users.RECEPCAO, { chargeId: id, reason: "Teste" });
    assert.equal(
      await sqlState(`UPDATE "Charge" SET "status" = 'ATIVA', "cancelledAt" = NULL, "cancelledById" = NULL, "cancelReason" = NULL WHERE "id" = $1`, [id]),
      "23514",
    );
    assert.equal(await sqlState(`UPDATE "Charge" SET "cancelReason" = 'outro' WHERE "id" = $1`, [id]), "23514");
    assert.equal(await sqlState(`DELETE FROM "Charge" WHERE "id" = $1`, [id]), "23001");
    // Paciente e autor com cobrança não podem ser apagados (FK Restrict). O PostgreSQL 18 informa
    // ON DELETE RESTRICT como restrict_violation (23001); até o 17, foreign_key_violation (23503).
    assert.ok(["23503", "23001"].includes(String(await sqlState(`DELETE FROM "Patient" WHERE "id" = $1`, [activePatient]))));
    const saved = await row(id);
    assert.equal(saved.amountCents, 35_000);
    assert.equal(saved.cancelReason, "Teste");
  });

  it("substituta só aponta para cobrança cancelada (trigger)", async () => {
    const { id } = await createCharge(prisma, users.ADMIN, { ...data(), requestId: key() });
    assert.equal(
      await sqlState(
        `INSERT INTO "Charge" ("id","patientId","description","amountCents","dueDate","idempotencyKey","createdById","replacesChargeId")
         VALUES ($1,$2,'x',100,'2026-10-31',$3,$4,$5)`,
        [key(), activePatient, key(), users.ADMIN, id],
      ),
      "23514",
    );
  });

  it("reenvio simultâneo da mesma operação produz uma cobrança", async () => {
    const requestId = key();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createCharge(prisma, i % 2 ? users.RECEPCAO : users.FISIOTERAPEUTA, { ...data(), requestId })),
    );
    assert.equal(new Set(results.map((result) => result.id)).size, 1);
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(await prisma.charge.count({ where: { idempotencyKey: requestId } }), 1);
  });

  it("chave reutilizada com conteúdo incompatível não sobrescreve o original", async () => {
    const requestId = key();
    const original = await createCharge(prisma, users.ADMIN, { ...data(), requestId });
    for (const change of [{ amountCents: 35_001 }, { description: "Outra" }, { patientId: inactivePatient }, { dueDate: new Date("2026-11-01") }]) {
      assert.equal(await rejection(createCharge(prisma, users.ADMIN, { ...data(change), requestId })), KEY_MISMATCH);
    }
    // Mesmo reenvio, mesma resposta, sem duplicar.
    assert.deepEqual(await createCharge(prisma, users.RECEPCAO, { ...data(), requestId }), { id: original.id, created: false });
    // Concorrência com conteúdos diferentes: o primeiro grava, os demais são recusados.
    const raceKey = key();
    const outcomes = await Promise.allSettled(
      [100, 200, 300, 400].map((amountCents) => createCharge(prisma, users.ADMIN, { ...data({ amountCents }), requestId: raceKey })),
    );
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    for (const outcome of outcomes.filter((item) => item.status === "rejected")) {
      assert.equal((outcome as PromiseRejectedResult).reason.message, KEY_MISMATCH);
    }
    assert.equal(await prisma.charge.count({ where: { idempotencyKey: raceKey } }), 1);
    const saved = await row(original.id);
    assert.equal(saved.amountCents, 35_000);
    assert.equal(saved.status, "ATIVA");
  });

  it("cancelamento grava motivo, autor e data; repetir (inclusive em paralelo) não muda nada", async () => {
    const { id } = await createCharge(prisma, users.ADMIN, { ...data(), requestId: key() });
    const results = await Promise.all(
      [users.RECEPCAO, users.FISIOTERAPEUTA, users.ADMIN, users.RECEPCAO].map((actorId, i) =>
        cancelCharge(prisma, actorId, { chargeId: id, reason: `Motivo ${i}` }),
      ),
    );
    assert.equal(results.filter((result) => !result.alreadyCancelled).length, 1);
    const first = await row(id);
    assert.equal(first.status, "CANCELADA");
    assert.ok(first.cancelledAt && first.cancelledById && first.cancelReason);

    assert.deepEqual(await cancelCharge(prisma, users.ADMIN, { chargeId: id, reason: "Outro motivo" }), { alreadyCancelled: true });
    assert.deepEqual(await row(id), first);
    assert.equal(await rejection(cancelCharge(prisma, users.ADMIN, { chargeId: "inexistente", reason: "x" })), CHARGE_NOT_FOUND);
  });

  it("contrato da FIN-02: pagamento válido impede cancelar e substituir, checado sob a trava", async () => {
    const { id } = await createCharge(prisma, users.ADMIN, { ...data(), requestId: key() });
    let checkedUnderLock = false;
    const hooks = {
      hasValidPayments: async (_tx: unknown, chargeId: string) => {
        // Outra conexão não consegue travar a mesma cobrança enquanto a checagem roda.
        const locked = await other
          .query(`SELECT 1 FROM "Charge" WHERE "id" = $1 FOR UPDATE NOWAIT`, [chargeId])
          .then(() => false, (error: { code?: string }) => error.code === "55P03");
        checkedUnderLock = locked;
        return true;
      },
    };
    assert.equal(await rejection(cancelCharge(prisma, users.ADMIN, { chargeId: id, reason: "x" }, hooks)), HAS_VALID_PAYMENTS);
    assert.equal(checkedUnderLock, true);
    const requestId = key();
    assert.equal(
      await rejection(replaceCharge(prisma, users.ADMIN, { ...data(), chargeId: id, reason: "x", requestId }, hooks)),
      HAS_VALID_PAYMENTS,
    );
    assert.equal((await row(id)).status, "ATIVA");
    assert.equal(await prisma.charge.count({ where: { idempotencyKey: requestId } }), 0);
  });

  it("substituição cancela a original e lança a nova ligada a ela, numa transação", async () => {
    const { id: originalId } = await createCharge(prisma, users.RECEPCAO, { ...data(), requestId: key() });
    const requestId = key();
    const result = await replaceCharge(prisma, users.FISIOTERAPEUTA, {
      ...data({ amountCents: 30_000, patientId: inactivePatient }),
      chargeId: originalId,
      reason: "Valor e paciente errados",
      requestId,
    });
    assert.equal(result.created, true);
    const original = await row(originalId);
    assert.equal(original.status, "CANCELADA");
    assert.equal(original.cancelReason, "Valor e paciente errados");
    assert.equal(original.cancelledById, users.FISIOTERAPEUTA);
    assert.equal(original.createdById, users.RECEPCAO);
    const substitute = await row(result.id);
    assert.equal(substitute.replacesChargeId, originalId);
    assert.equal(substitute.amountCents, 30_000);
    assert.equal(substitute.createdById, users.FISIOTERAPEUTA);
    const linked = await prisma.charge.findUniqueOrThrow({ where: { id: originalId }, select: { replacedBy: { select: { id: true } } } });
    assert.equal(linked.replacedBy?.id, result.id);

    // Reenvio da mesma substituição: mesma cobrança, nada duplicado.
    assert.deepEqual(
      await replaceCharge(prisma, users.FISIOTERAPEUTA, {
        ...data({ amountCents: 30_000, patientId: inactivePatient }),
        chargeId: originalId,
        reason: "Valor e paciente errados",
        requestId,
      }),
      { id: result.id, created: false },
    );
    // Original cancelada não é substituída de novo.
    assert.equal(
      await rejection(replaceCharge(prisma, users.ADMIN, { ...data(), chargeId: originalId, reason: "x", requestId: key() })),
      ALREADY_CANCELLED,
    );
    assert.equal(await prisma.charge.count({ where: { replacesChargeId: originalId } }), 1);
  });

  it("falha na substituição desfaz o cancelamento da original", async () => {
    const { id } = await createCharge(prisma, users.ADMIN, { ...data(), requestId: key() });
    assert.equal(
      await rejection(replaceCharge(prisma, users.ADMIN, { ...data({ patientId: "inexistente" }), chargeId: id, reason: "x", requestId: key() })),
      PATIENT_NOT_FOUND,
    );
    const saved = await row(id);
    assert.equal(saved.status, "ATIVA");
    assert.equal(saved.cancelReason, null);
  });

  it("substituições simultâneas da mesma original: só uma vale", async () => {
    const { id } = await createCharge(prisma, users.ADMIN, { ...data(), requestId: key() });
    const outcomes = await Promise.allSettled(
      [users.ADMIN, users.RECEPCAO, users.FISIOTERAPEUTA, users.RECEPCAO].map((actorId, i) =>
        replaceCharge(prisma, actorId, { ...data({ amountCents: 1_000 + i }), chargeId: id, reason: `Correção ${i}`, requestId: key() }),
      ),
    );
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    for (const outcome of outcomes.filter((item) => item.status === "rejected")) {
      assert.equal((outcome as PromiseRejectedResult).reason.message, ALREADY_CANCELLED);
    }
    assert.equal(await prisma.charge.count({ where: { replacesChargeId: id } }), 1);

    // Mesma substituição reenviada em paralelo (mesma chave): uma substituta.
    const { id: second } = await createCharge(prisma, users.ADMIN, { ...data(), requestId: key() });
    const requestId = key();
    const same = await Promise.all(
      Array.from({ length: 5 }, () => replaceCharge(prisma, users.RECEPCAO, { ...data(), chargeId: second, reason: "Duplo clique", requestId })),
    );
    assert.equal(new Set(same.map((result) => result.id)).size, 1);
    assert.equal(await prisma.charge.count({ where: { replacesChargeId: second } }), 1);
  });

  it("usuário com lançamento financeiro não é excluído; o histórico fica", async () => {
    const author = await prisma.user.create({
      data: { name: "FIN AUTOR", email: `fin-autor-${suffix}@teste.local`, passwordHash: "x", role: "RECEPCAO", active: false },
      select: { id: true },
    });
    const { id } = await createCharge(prisma, author.id, { ...data(), requestId: key() });
    await assert.rejects(
      deleteDeactivatedUser(prisma, { actorId: users.ADMIN, actorRole: "ADMIN", ip: null }, author.id),
      (error: Error) => error.message === linkedMessage(["financeiro"]),
    );
    assert.equal(await prisma.user.count({ where: { id: author.id } }), 1);
    assert.equal((await row(id)).createdById, author.id);

    const canceller = await prisma.user.create({
      data: { name: "FIN CANCELA", email: `fin-cancela-${suffix}@teste.local`, passwordHash: "x", role: "FISIOTERAPEUTA" },
      select: { id: true },
    });
    await cancelCharge(prisma, canceller.id, { chargeId: id, reason: "Teste" });
    await prisma.user.update({ where: { id: canceller.id }, data: { active: false } });
    await assert.rejects(
      deleteDeactivatedUser(prisma, { actorId: users.ADMIN, actorRole: "ADMIN", ip: null }, canceller.id),
      (error: Error) => error.message === linkedMessage(["financeiro"]),
    );
  });
});
