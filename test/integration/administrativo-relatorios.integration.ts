import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { seedBeneficiary, beneficiaryMeta } from "./beneficiary-fixture";
import { saveProduction } from "@/modules/administrativo/production-service";
import { saveAuthorizationRule } from "@/modules/administrativo/beneficiary-service";
import { authorizationRuleSchema } from "@/modules/administrativo/beneficiary-validation";
import { productionSchema } from "@/modules/administrativo/production-validation";
import { saveAdministrativeConfig } from "@/modules/administrativo/service";
import { readAdministrativeReport } from "@/modules/administrativo/report-read";
import { administrativeReportCsv } from "@/modules/administrativo/report-csv";
const url = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !url) throw new Error('Banco obrigatório');
describe('relatórios administrativos PostgreSQL (#100)', { skip: !url }, () => {
  let db: PrismaClient, actor: string, professional: string;
  before(async () => { db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) }); actor = (await db.user.create({ data: { name: 'ADMIN SINTETICO 100', email: `adm100-${randomUUID()}@example.test`, passwordHash: 'x', role: 'ADMIN' } })).id; professional = (await db.user.create({ data: { name: 'FISIO 100', email: `fisio100-${randomUUID()}@example.test`, passwordHash: 'x', role: 'FISIOTERAPEUTA' } })).id; });
  after(async () => { await db?.$disconnect(); });
  async function fixture() {
    const f = await seedBeneficiary(db, actor);
    const a = await db.anamnesis.create({ data: { patientId: f.patientId, authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO', assessmentDate: new Date('2026-01-01'), chiefComplaint: 'DADO CLINICO SECRETO' } });
    const assessment = await db.assessment.create({ data: { patientId: f.patientId, anamnesisId: a.id, authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO', assessmentDate: new Date('2026-01-01'), diagnosis: 'DADO CLINICO SECRETO' } });
    const plan = await db.therapyPlan.create({ data: { patientId: f.patientId, assessmentId: assessment.id, assessmentVersion: 1, authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO', revisions: { create: { number: 1, kind: 'INICIAL', planDate: new Date('2026-01-01'), goals: 'SINTETICO', conduct: 'SINTETICO', authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO' } } }, include: { revisions: true } });
    const session = async () => db.treatmentSession.create({ data: { patientId: f.patientId, planId: plan.id, planRevisionId: plan.revisions[0].id, occurredAt: new Date('2026-01-16T02:30:00Z'), professionalId: professional, professionalNameSnapshot: 'FISIO SINTETICO', evolution: 'DADO CLINICO SECRETO', idempotencyKey: randomUUID(), authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO' } });
    const s = await session();
    const tariff = { ...beneficiaryMeta(), active: true, procedureId: f.procedureId, amount: 5237, startsOn: new Date('2026-01-01'), endsOn: null };
    await saveAdministrativeConfig(db, actor, { kind: 'tariff', values: tariff });
    const input = (patch = {}) => productionSchema.parse({ ...beneficiaryMeta(), sessionId: s.id, coverageId: f.coverage.id, procedureId: f.procedureId, quantity: '2', endTime: '', authorizationItemId: f.item.id, operation: 'CONFERIR', ...patch });
    return { ...f, s, session, input, tariff };
  }

  it('páginas, CSV integral e totais independentes sem multiplicar movimentos', async () => {
    const f = await fixture();
    for (let i = 0;i < 25;i++) { const s = i === 0 ? f.s : await f.session(); await saveProduction(db, actor, f.input({ sessionId: s.id, quantity: 1, operation: i < 5 ? 'CONFERIR' : 'PREPARAR' })); }
    const filters = { page: 1, patientId: f.patientId, start: '2026-01-15', end: '2026-01-15' };
    const first = await readAdministrativeReport(db, 'producao', filters), second = await readAdministrativeReport(db, 'producao', { ...filters, page: 2 }), all = await readAdministrativeReport(db, 'producao', filters, 'all');
    assert.equal(first.total, 25); assert.equal(first.items.length, 20); assert.equal(second.items.length, 5); assert.equal(new Set([...first.items, ...second.items].map(x => x.id)).size, 25); assert.equal(all.items.length, 25);
    const independent = await db.productionItem.aggregate({ where: { coverageId: f.coverage.id, state: 'APTO' }, _sum: { quantity: true, amountCents: true } });
    assert.equal(all.totals.filter(t => t.state === 'APTO').reduce((n, t) => n + t.quantity, BigInt(0)), BigInt(independent._sum.quantity!)); assert.equal(all.totals.reduce((n, t) => n + (t.amountCents ?? BigInt(0)), BigInt(0)), independent._sum.amountCents);
    assert.equal(all.totals.filter(t => t.state === 'PENDENTE').reduce((n, t) => n + t.quantity, BigInt(0)), BigInt(20));
    const csv = administrativeReportCsv(all); assert.equal(csv.split('\r\n').filter(l => l.startsWith('"ITEM";')).length, 25); assert.ok(!csv.includes('DADO CLINICO')); assert.ok(!csv.includes('000SENHA'));
    const pending = await readAdministrativeReport(db, 'pendencias', filters, 'all'); assert.equal(pending.total, 20); assert.ok(pending.items.every(x => x.reason.length > 0));
    const auth = await readAdministrativeReport(db, 'autorizacoes', { page: 1, patientId: f.patientId, start: '2026-01-31', end: '2026-02-01' }, 'all', new Date('2026-01-20T12:00:00Z'));
    assert.equal(auth.total, 1); assert.equal(auth.items[0].authorized, BigInt(10)); assert.equal(auth.items[0].consumed, BigInt(5)); assert.equal(auth.items[0].available, BigInt(5)); assert.equal(auth.totals[0].consumed, BigInt(5));
    const firstItem = await db.productionItem.findFirstOrThrow({ where: { sessionId: f.s.id } });
    await saveProduction(db, actor, f.input({ id: firstItem.id, expectedVersion: 1, requestId: randomUUID(), quantity: 1, operation: 'DEVOLVER' }));
    const returned = await readAdministrativeReport(db, 'autorizacoes', { page: 1, patientId: f.patientId }, 'all'); assert.equal(returned.items[0].consumed, BigInt(4)); assert.equal(returned.items[0].available, BigInt(6));
    assert.equal((await readAdministrativeReport(db, 'producao', { ...filters, start: '2026-01-16' }, 'all')).total, 0);
    assert.equal((await readAdministrativeReport(db, 'autorizacoes', { page: 1, patientId: f.patientId, start: '2026-02-01' }, 'all')).total, 0);
  });
  it('centavos acima de Number.MAX_SAFE_INTEGER permanecem exatos', async () => {
    const f = await fixture(); await saveAuthorizationRule(db, actor, authorizationRuleSchema.parse({ ...f.rule, id: randomUUID(), mode: 'DISPENSADA', expectedVersion: 1, requestId: randomUUID() }));
    await saveAdministrativeConfig(db, actor, { kind: 'tariff', values: { ...f.tariff, expectedVersion: 1, requestId: randomUUID(), amount: 99999999 } });
    await saveProduction(db, actor, f.input({ quantity: 2000000000, authorizationItemId: '' }));
    const r = await readAdministrativeReport(db, 'producao', { page: 1, patientId: f.patientId }, 'all'); const exact = BigInt(2000000000) * BigInt(99999999);
    assert.ok(exact > BigInt(Number.MAX_SAFE_INTEGER)); assert.equal(r.items[0].amountCents, exact); assert.equal(r.totals[0].amountCents, exact); assert.ok(administrativeReportCsv(r).includes(String(exact)));
  });
  it('limite impede exportação e impressão parciais, mantendo a página', async () => {
    const f = await fixture(); for (let i = 0;i < 3;i++) { const s = i === 0 ? f.s : await f.session(); await saveProduction(db, actor, f.input({ sessionId: s.id, operation: 'PREPARAR' })); }
    const c = await db.operatorContract.findUniqueOrThrow({ where: { id: f.contractId } });
    await saveAdministrativeConfig(db, actor, { kind: 'contract', values: { ...c, ...beneficiaryMeta(), id: c.id, expectedVersion: c.version, maxExportRows: 1, active: true } });
    const page = await readAdministrativeReport(db, 'producao', { page: 1, patientId: f.patientId }); assert.equal(page.total, 3); assert.equal(page.items.length, 3);
    const full = await readAdministrativeReport(db, 'producao', { page: 1, patientId: f.patientId }, 'all'); assert.match(full.error!, /excede/); assert.equal(full.items.length, 0); assert.throws(() => administrativeReportCsv(full));
  });
  it('RepeatableRead conserva itens e totais diante de gravação concorrente', async () => {
    const f = await fixture(); await saveProduction(db, actor, f.input({ operation: 'PREPARAR' })); let inserted = false;
    const proxy = { $transaction: async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => db.$transaction(async tx => callback(new Proxy(tx, { get(target, key) { if (key === '$queryRaw') return async (...args: unknown[]) => { const result = await (target.$queryRaw as (...a: unknown[]) => Promise<unknown>)(...args); if (!inserted) { inserted = true; const s = await f.session(); await saveProduction(db, actor, f.input({ sessionId: s.id, operation: 'PREPARAR' })); } return result; }; return Reflect.get(target, key); } })), options as never) };
    const r = await readAdministrativeReport(proxy as unknown as Pick<PrismaClient, '$transaction'>, 'producao', { page: 1, patientId: f.patientId }, 'all'); assert.equal(r.total, 1); assert.equal(r.items.length, 1); assert.equal(r.totals[0].count, BigInt(1)); assert.equal(await db.productionItem.count({ where: { coverageId: f.coverage.id } }), 2);
  });
});
