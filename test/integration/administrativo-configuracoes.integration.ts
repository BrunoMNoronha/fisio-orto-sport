import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { saveAdministrativeConfig, CONFIG_CONFLICT } from "@/modules/administrativo/service";
import { operatorSchema, contractSchema } from "@/modules/administrativo/validation";
import { previewReset } from "@/modules/manutencao/reset";
import { linkedCategories } from "@/modules/auth/users/delete";

const url = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !url) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

describe("configurações administrativas no PostgreSQL (#97)", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let db: PrismaClient;
  let writer: PrismaClient;
  let actor: string;
  const operatorInput = (patch = {}) => operatorSchema.parse({ id: randomUUID(), requestId: randomUUID(), expectedVersion: 0,
    name: `OPERADORA SINTETICA ${randomUUID()}`, registrationAns: "", active: "true", reason: "Teste fictício", ...patch });
  const contractInput = (operatorId: string, patch = {}) => contractSchema.parse({ id: randomUUID(), requestId: randomUUID(), expectedVersion: 0,
    name: `CONTRATO SINTETICO ${randomUUID()}`, operatorId, providerCode: "000123", cnes: "", tissVersion: "", manualReference: "", active: "true", reason: "Teste fictício", ...patch });
  const createOperator = async () => {
    const values = operatorInput(); await saveAdministrativeConfig(db, actor, { kind: "operator", values }); return values;
  };
  before(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    writer = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    actor = (await db.user.create({ data: { name: "ADMIN SINTETICO ADM01", email: `adm01-${randomUUID()}@example.test`, passwordHash: "x", role: "ADMIN" } })).id;
  });
  after(async () => { await db?.$disconnect(); await writer?.$disconnect(); });

  it("salva pendências, zeros e snapshot sem inferir piloto ou homologação", async () => {
    const op = await createOperator();
    const values = contractInput(op.id);
    await saveAdministrativeConfig(db, actor, { kind: "contract", values });
    const saved = await db.operatorContract.findUniqueOrThrow({ where: { id: values.id } });
    assert.equal(saved.maxGuides, 100); assert.equal(saved.maxXmlBytes, 2097152);
    assert.equal(saved.providerCode, "000123"); assert.equal(saved.tissVersion, null); assert.equal(saved.cnes, null);
    const changes = await db.administrativeConfigChange.findMany({ where: { contractId: values.id } });
    assert.equal(changes.length, 1); assert.equal(changes[0].actorId, actor);
    assert.equal((changes[0].snapshot as { providerCode: string }).providerCode, "000123");
  });
  it("persiste limites editados e canal com snapshot imutável", async () => {
    const op = await createOperator();
    const original = contractInput(op.id);
    await saveAdministrativeConfig(db, actor, { kind: "contract", values: original });
    const updated = { ...original, expectedVersion: 1, requestId: randomUUID(), maxGuides: 200, homologationChannel: "Portal sintético" };
    await saveAdministrativeConfig(db, actor, { kind: "contract", values: updated });
    const saved = await db.operatorContract.findUniqueOrThrow({ where: { id: original.id } });
    assert.equal(saved.maxGuides, 200); assert.equal(saved.homologationChannel, "Portal sintético");
    const versions = await db.administrativeConfigChange.findMany({ where: { contractId: original.id }, orderBy: { version: "asc" } });
    assert.equal((versions[0].snapshot as { maxGuides: number }).maxGuides, 100);
    assert.equal((versions[1].snapshot as { maxGuides: number }).maxGuides, 200);
  });
  it("replay é idempotente mesmo após edição, e payload divergente é recusado", async () => {
    const original = await createOperator();
    const update = { ...original, name: "NOME FICTICIO ALTERADO", expectedVersion: 1, requestId: randomUUID() };
    await saveAdministrativeConfig(db, actor, { kind: "operator", values: update });
    assert.equal(await saveAdministrativeConfig(db, actor, { kind: "operator", values: original }), original.id);
    await assert.rejects(saveAdministrativeConfig(db, actor, { kind: "operator", values: { ...original, name: "DIVERGENTE" } }), /outros dados/);
    assert.equal((await db.healthOperator.findUniqueOrThrow({ where: { id: original.id } })).version, 2);
    assert.equal(await db.administrativeConfigChange.count({ where: { operatorId: original.id } }), 2);
  });
  it("dois editores concorrentes preservam uma única nova versão", async () => {
    const original = await createOperator();
    const results = await Promise.allSettled([db, writer].map((client, i) => saveAdministrativeConfig(client, actor, {
      kind: "operator", values: { ...original, name: `ALTERADO ${i}`, expectedVersion: 1, requestId: randomUUID() },
    })));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const rejected = results.find((r) => r.status === "rejected");
    assert.equal(rejected?.status === "rejected" && rejected.reason.message, CONFIG_CONFLICT);
    assert.equal(await db.administrativeConfigChange.count({ where: { operatorId: original.id } }), 2);
  });
  it("duas criações com o mesmo envio não duplicam operadora", async () => {
    const values = operatorInput();
    const results = await Promise.all([db, writer].map((client) => saveAdministrativeConfig(client, actor, { kind: "operator", values })));
    assert.deepEqual(results, [values.id, values.id]);
    assert.equal(await db.administrativeConfigChange.count({ where: { operatorId: values.id } }), 1);
  });
  it("contrato não muda de operadora e operadora inativa não ativa novo contrato", async () => {
    const op = await createOperator(); const other = await createOperator();
    const contract = contractInput(op.id); await saveAdministrativeConfig(db, actor, { kind: "contract", values: contract });
    await assert.rejects(saveAdministrativeConfig(db, actor, { kind: "contract", values: { ...contract, operatorId: other.id, expectedVersion: 1, requestId: randomUUID() } }), /não pode ser alterado/);
    await saveAdministrativeConfig(db, actor, { kind: "operator", values: { ...op, active: false, expectedVersion: 1, requestId: randomUUID() } });
    await assert.rejects(saveAdministrativeConfig(db, actor, { kind: "contract", values: contractInput(op.id) }), /Reative/);
    assert.equal(await db.operatorContract.count({ where: { operatorId: op.id } }), 1);
    assert.equal(await db.administrativeConfigChange.count({ where: { contractId: contract.id } }), 1);
  });
  it("FK inválida reverte cadastro e histórico; registro ANS duplicado é recusado", async () => {
    const values = operatorInput();
    await assert.rejects(saveAdministrativeConfig(db, "autor-inexistente", { kind: "operator", values }));
    assert.equal(await db.healthOperator.count({ where: { id: values.id } }), 0);
    const ans = String(Math.floor(Math.random() * 900000) + 100000);
    await saveAdministrativeConfig(db, actor, { kind: "operator", values: operatorInput({ registrationAns: ans }) });
    const duplicate = operatorInput({ registrationAns: ans });
    await assert.rejects(saveAdministrativeConfig(db, actor, { kind: "operator", values: duplicate }), /já cadastrado/);
    assert.equal(await db.healthOperator.count({ where: { id: duplicate.id } }), 0);
  });
  it("banco bloqueia excluir, alterar histórico e editar cadastro sem versão/histórico", async () => {
    const op = await createOperator();
    await assert.rejects(db.healthOperator.delete({ where: { id: op.id } }));
    await assert.rejects(db.healthOperator.update({ where: { id: op.id }, data: { name: "SEM VERSAO" } }));
    await assert.rejects(db.healthOperator.update({ where: { id: op.id }, data: { name: "SEM HISTORICO", version: { increment: 1 } } }));
    const history = await db.administrativeConfigChange.findFirstOrThrow({ where: { operatorId: op.id } });
    await assert.rejects(db.administrativeConfigChange.update({ where: { id: history.id }, data: { reason: "Apagar rastreabilidade" } }));
    await assert.rejects(db.administrativeConfigChange.delete({ where: { id: history.id } }));
    assert.equal((await db.healthOperator.findUniqueOrThrow({ where: { id: op.id } })).version, 1);
  });
  it("manutenção preserva configurações e autoria impede exclusão do usuário", async () => {
    const op = await createOperator();
    await saveAdministrativeConfig(db, actor, { kind: "contract", values: contractInput(op.id) });
    const reset = await previewReset(db);
    assert.deepEqual(reset.problems, []);
    assert.ok(reset.keep.HealthOperator > 0); assert.ok(reset.keep.OperatorContract > 0); assert.ok(reset.keep.AdministrativeConfigChange > 0);
    const categories = await db.$transaction((tx) => linkedCategories(tx, actor));
    assert.ok(categories.includes("configuracoes"));
  });
});
