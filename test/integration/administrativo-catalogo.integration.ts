import { CONTRACT_DEFAULTS } from "@/modules/administrativo/contract-defaults";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { saveAdministrativeConfig } from "@/modules/administrativo/service";
import { procedureSchema, tariffSchema, professionalSchema } from "@/modules/administrativo/catalog-validation";
import { readTariffSnapshot } from "@/modules/administrativo/catalog-read";
import { previewReset } from "@/modules/manutencao/reset";
import { linkedCategories } from "@/modules/auth/users/delete";
const url = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !url) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");
describe("catálogo administrativo PostgreSQL (#97)", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let db: PrismaClient, writer: PrismaClient, actor: string, contractId: string;
  const meta = () => ({ id: randomUUID(), requestId: randomUUID(), expectedVersion: 0, reason: "Teste fictício", active: "true" });
  const procedure = (patch = {}) => procedureSchema.parse({ ...meta(), contractId, tableCode: "00", code: randomUUID().slice(0,8), name: "Procedimento sintético", ...patch });
  const tariff = (procedureId: string, patch = {}) => tariffSchema.parse({ ...meta(), procedureId, amount: "123,45", startsOn: "2026-01-01", endsOn: "2026-01-31", ...patch });
  const professional = (patch = {}) => professionalSchema.parse({ ...meta(), name: "Profissional sintético", userId: "", purpose: "AMBOS",
    councilCode: "", councilNumber: "", councilState: "", occupationCode: "", ...patch });
  const createProcedure = async () => { const item = procedure(); await saveAdministrativeConfig(db, actor, { kind: "procedure", values: item }); return item; };
  before(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    writer = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    actor = (await db.user.create({ data: { name: "ADMIN CATALOGO", email: `catalog-${randomUUID()}@example.test`, passwordHash: "x", role: "ADMIN" } })).id;
    const operatorId = randomUUID(); contractId = randomUUID();
    await saveAdministrativeConfig(db, actor, { kind: "operator", values: { ...meta(), active: true, name: "OPERADORA SINTETICA", registrationAns: null, id: operatorId } });
    await saveAdministrativeConfig(db, actor, { kind: "contract", values: { ...meta(), active: true, id: contractId, operatorId, name: "CONTRATO SINTETICO",
      providerCode: null, cnes: null, tissVersion: null, manualReference: null, homologationChannel: null, ...CONTRACT_DEFAULTS } });
  });
  after(async () => { await db?.$disconnect(); await writer?.$disconnect(); });
  it("preserva zeros e impede duplicidade e troca da identidade do procedimento", async () => {
    const item = procedure({ code: "0000123" });
    await saveAdministrativeConfig(db, actor, { kind: "procedure", values: item });
    assert.equal((await db.billingProcedure.findUniqueOrThrow({ where: { id: item.id } })).code, "0000123");
    await assert.rejects(saveAdministrativeConfig(db, actor, { kind: "procedure", values: { ...item, id: randomUUID(), requestId: randomUUID() } }), /já cadastrado/);
    await assert.rejects(saveAdministrativeConfig(db, actor, { kind: "procedure", values: { ...item, code: "123", expectedVersion: 1, requestId: randomUUID() } }), /imutáveis/);
    await assert.rejects(db.billingProcedure.update({ where: { id: item.id }, data: { code: "123", version: { increment: 1 } } }));
    await assert.rejects(db.billingProcedure.delete({ where: { id: item.id } }));
  });
  it("resolve limites inclusivos, lacunas e tarifas de um dia", async () => {
    const item = await createProcedure();
    const first = tariff(item.id);
    await saveAdministrativeConfig(db, actor, { kind: "tariff", values: first });
    for (const date of ["2026-01-01","2026-01-31"]) {
      const result = await readTariffSnapshot(db, contractId, item.id, date);
      assert.equal(result.status,"OK"); if (result.status === "OK") assert.equal(result.snapshot.amountCents,12345);
    }
    assert.equal((await readTariffSnapshot(db, contractId, item.id, "2025-12-31")).status,"SEM_TARIFA");
    const next = tariff(item.id, { startsOn: "2026-02-01", endsOn: "2026-02-01", amount: "1,01" });
    await saveAdministrativeConfig(db, actor, { kind: "tariff", values: next });
    assert.equal((await readTariffSnapshot(db, contractId, item.id, "2026-02-01")).status,"OK");
    assert.equal((await readTariffSnapshot(db, contractId, item.id, "2026-02-02")).status,"SEM_TARIFA");
    assert.equal((await readTariffSnapshot(db, randomUUID(), item.id, "2026-01-01")).status,"PROCEDIMENTO_NAO_ENCONTRADO");
    assert.equal((await readTariffSnapshot(db, contractId, item.id, "2026-02-30")).status,"DATA_INVALIDA");
  });
  it("mesmo código em outro contrato é independente; contrato inativo recusa novos vínculos", async () => {
    const item = await createProcedure();
    const parent = await db.operatorContract.findUniqueOrThrow({ where: { id: contractId } });
    const secondId = randomUUID();
    const second = { ...meta(), active: true, id: secondId, operatorId: parent.operatorId, name: `OUTRO ${secondId}`,
      providerCode: null, cnes: null, tissVersion: null, manualReference: null, homologationChannel: null, ...CONTRACT_DEFAULTS };
    await saveAdministrativeConfig(db, actor, { kind: "contract", values: second });
    const other = procedure({ contractId: secondId, code: item.code });
    await saveAdministrativeConfig(db, actor, { kind: "procedure", values: other });
    await saveAdministrativeConfig(db, actor, { kind: "contract", values: { ...second, active: false, expectedVersion: 1, requestId: randomUUID() } });
    await assert.rejects(saveAdministrativeConfig(db, actor, { kind: "procedure", values: procedure({ contractId: secondId }) }), /Ative/);
    assert.equal((await readTariffSnapshot(db, secondId, other.id, "2026-01-01")).status,"INATIVO");
  });
  it("recusa sobreposição inclusive na fronteira e reverte edição e histórico", async () => {
    const item = await createProcedure(), first = tariff(item.id);
    await saveAdministrativeConfig(db, actor, { kind: "tariff", values: first });
    const second = tariff(item.id, { startsOn: "2026-02-01", endsOn: "" });
    await saveAdministrativeConfig(db, actor, { kind: "tariff", values: second });
    await assert.rejects(saveAdministrativeConfig(db, actor, { kind: "tariff", values: { ...first, endsOn: new Date("2026-02-01"), expectedVersion: 1, requestId: randomUUID() } }), /Já existe uma tarifa/);
    assert.equal((await db.procedureTariff.findUniqueOrThrow({ where: { id: first.id } })).version,1);
    assert.equal(await db.administrativeConfigChange.count({ where: { tariffId: first.id } }),1);
    await assert.rejects(saveAdministrativeConfig(db, actor, { kind: "tariff", values: tariff(item.id, { startsOn: "2026-01-31", endsOn: "2026-01-31" }) }), /Já existe uma tarifa/);
    await assert.rejects(saveAdministrativeConfig(db, actor, { kind: "tariff", values: tariff(item.id, { startsOn: "2027-01-01", endsOn: "" }) }), /Já existe uma tarifa/);
  });
  it("exclusão GiST bloqueia concorrência sem depender da trava do serviço", async () => {
    const item = await createProcedure();
    const direct = async (client: PrismaClient) => {
      const values = tariff(item.id);
      return client.$transaction(async (tx) => {
        await tx.procedureTariff.create({ data: { id: values.id, procedureId: item.id, amountCents: values.amount, startsOn: values.startsOn, endsOn: values.endsOn,
          createdById: actor, updatedById: actor } });
        await tx.administrativeConfigChange.create({ data: { tariffId: values.id, version: 1, actorId: actor, reason: values.reason, requestId: values.requestId,
          fingerprint: "a".repeat(64), snapshot: { procedureId: item.id, amountCents: values.amount, startsOn: "2026-01-01", endsOn: "2026-01-31", active: true } } });
      });
    };
    const results = await Promise.allSettled([direct(db), direct(writer)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length,1);
    assert.equal(await db.procedureTariff.count({ where: { procedureId: item.id } }),1);
    const failure = results.find((r) => r.status === "rejected");
    assert.match(String(failure?.status === "rejected" && failure.reason), /ProcedureTariff_no_overlap|exclusion constraint/i);
  });
  it("snapshot capturado e histórico permanecem após alteração do preço e nome", async () => {
    const item = await createProcedure(), price = tariff(item.id);
    await saveAdministrativeConfig(db, actor, { kind: "tariff", values: price });
    const before = await readTariffSnapshot(db, contractId, item.id, "2026-01-10");
    await saveAdministrativeConfig(db, actor, { kind: "tariff", values: { ...price, amount: 20000, expectedVersion: 1, requestId: randomUUID() } });
    await saveAdministrativeConfig(db, actor, { kind: "procedure", values: { ...item, name: "NOVO NOME", expectedVersion: 1, requestId: randomUUID() } });
    assert.equal(before.status,"OK");
    if (before.status === "OK") { assert.equal(before.snapshot.amountCents,12345); assert.equal(before.snapshot.tariffVersion,1); assert.equal(before.snapshot.name,item.name); }
    const after = await readTariffSnapshot(db, contractId, item.id, "2026-01-10");
    if (after.status !== "OK") assert.fail("Tarifa esperada");
    assert.equal(after.snapshot.amountCents,20000); assert.equal(after.snapshot.tariffVersion,2);
    const old = await db.administrativeConfigChange.findFirstOrThrow({ where: { tariffId: price.id, version: 1 } });
    assert.equal((old.snapshot as { amountCents: number }).amountCents,12345);
    await assert.rejects(db.administrativeConfigChange.update({ where: { id: old.id }, data: { reason: "Sobrescrever" } }));
    await assert.rejects(db.procedureTariff.update({ where: { id: price.id }, data: { amountCents: 1, version: { increment: 1 } } }));
  });
  it("inativo mantém consulta mas bloqueia resolução, novas tarifas e reativação dependente", async () => {
    const item = await createProcedure(), price = tariff(item.id);
    await saveAdministrativeConfig(db, actor, { kind: "tariff", values: price });
    await saveAdministrativeConfig(db, actor, { kind: "procedure", values: { ...item, active: false, expectedVersion: 1, requestId: randomUUID() } });
    assert.ok(await db.billingProcedure.findUnique({ where: { id: item.id } }));
    assert.equal((await readTariffSnapshot(db, contractId, item.id, "2026-01-10")).status,"INATIVO");
    await assert.rejects(saveAdministrativeConfig(db, actor, { kind: "tariff", values: tariff(item.id, { startsOn: "2027-01-01", endsOn: "" }) }), /Ative/);
    await saveAdministrativeConfig(db, actor, { kind: "tariff", values: { ...price, active: false, expectedVersion: 1, requestId: randomUUID() } });
  });
  it("concorrência e replay de tarifa mantêm uma única versão", async () => {
    const item = await createProcedure(), price = tariff(item.id);
    await Promise.all([db,writer].map((client) => saveAdministrativeConfig(client, actor, { kind: "tariff", values: price })));
    const results = await Promise.allSettled([db,writer].map((client,i) => saveAdministrativeConfig(client, actor, { kind: "tariff",
      values: { ...price, amount: 30000 + i, expectedVersion: 1, requestId: randomUUID() } })));
    assert.equal(results.filter((r) => r.status === "fulfilled").length,1);
    assert.equal(await db.administrativeConfigChange.count({ where: { tariffId: price.id } }),2);
    assert.equal(await saveAdministrativeConfig(db, actor, { kind: "tariff", values: price }),price.id);
  });
  it("profissional externo permite pendências; vínculo exige fisioterapeuta ativo e único", async () => {
    const external = professional({ purpose: "SOLICITANTE" });
    await saveAdministrativeConfig(db, actor, { kind: "professional", values: external });
    assert.equal((await db.billingProfessional.findUniqueOrThrow({ where: { id: external.id } })).councilCode,null);
    await assert.rejects(saveAdministrativeConfig(db, actor, { kind: "professional", values: professional({ userId: actor }) }), /fisioterapeuta ativo/);
    const fisio = await db.user.create({ data: { name: "FISIO SINTETICO", role: "FISIOTERAPEUTA", email: `fisio-${randomUUID()}@example.test`, passwordHash: "x" } });
    const linked = professional({ userId: fisio.id, councilCode: "06", councilNumber: "000123", councilState: "SP", occupationCode: "223605" });
    await saveAdministrativeConfig(db, actor, { kind: "professional", values: linked });
    await assert.rejects(saveAdministrativeConfig(db, actor, { kind: "professional", values: professional({ userId: fisio.id }) }), /já cadastrado/);
    await db.user.update({ where: { id: fisio.id }, data: { active: false } });
    await saveAdministrativeConfig(db, actor, { kind: "professional", values: { ...linked, active: false, expectedVersion: 1, requestId: randomUUID() } });
    await assert.rejects(saveAdministrativeConfig(db, actor, { kind: "professional", values: professional({ userId: fisio.id }) }), /fisioterapeuta ativo/);
    assert.ok((await linkedCategories(db, fisio.id)).includes("configuracoes"));
    await assert.rejects(db.user.delete({ where: { id: fisio.id } }));
    await assert.rejects(db.billingProfessional.delete({ where: { id: external.id } }));
    assert.deepEqual((await previewReset(db)).problems,[]);
  });
});
