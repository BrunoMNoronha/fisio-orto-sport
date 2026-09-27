// Integração com PostgreSQL real das configurações da clínica (issue #63): linha única, padrão
// sem gravação, versão contra sobrescrita, gravação e auditoria atômicas e CHECKs do banco. Usa o
// mesmo `saveClinicSettings` da action. Banco DESCARTÁVEL e já migrado (INTEGRATION_DATABASE_URL);
// os registros de auditoria criados aqui não podem ser apagados (trigger de retenção).
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { DEFAULT_SETTINGS } from "@/modules/configuracoes/settings";
import { SETTINGS_ID, SettingsConflictError, saveClinicSettings } from "@/modules/configuracoes/write";

const url = process.env.INTEGRATION_DATABASE_URL;
describe("configurações no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let prisma: PrismaClient;
  let adminId: string;
  const suffix = Date.now();

  const actor = () => ({ id: adminId, role: "ADMIN" as Role, ip: null });
  const values = (patch: Partial<typeof DEFAULT_SETTINGS>) => ({ ...DEFAULT_SETTINGS, ...patch });
  const auditsOf = (id: string) =>
    prisma.auditLog.findMany({ where: { actorId: id, action: "CONFIGURACAO_ALTERADA" }, orderBy: { createdAt: "asc" } });

  before(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const admin = await prisma.user.create({
      data: { name: "Admin Config", email: `admin-config-${suffix}@teste.local`, passwordHash: "x", role: "ADMIN" },
      select: { id: true },
    });
    adminId = admin.id;
  });

  beforeEach(async () => {
    await prisma.clinicSettings.deleteMany({});
  });

  after(async () => {
    await prisma?.clinicSettings.deleteMany({});
    await prisma?.$disconnect();
  });

  it("primeira gravação cria a linha única (versão 1) e audita versão e campos, sem valores", async () => {
    const result = await saveClinicSettings(prisma, {
      values: values({ displayName: "Clínica Integração", phone: "61999990000" }),
      expectedVersion: 0,
      actor: actor(),
    });
    assert.deepEqual(result, { version: 1, fields: ["displayName", "phone"] });

    const row = await prisma.clinicSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID } });
    assert.equal(row.version, 1);
    assert.equal(row.displayName, "Clínica Integração");
    assert.equal(row.updatedById, adminId);

    const [audit] = await auditsOf(adminId);
    assert.equal(audit.result, "SUCESSO");
    assert.equal(audit.actorRole, "ADMIN");
    assert.equal(audit.details, "Versão 1: Nome de exibição, Telefone");
    assert.doesNotMatch(audit.details ?? "", /61999990000|Integração/);
  });

  it("versão desatualizada é recusada sem alterar nada (sem sobrescrita silenciosa)", async () => {
    await saveClinicSettings(prisma, { values: values({ displayName: "A" }), expectedVersion: 0, actor: actor() });
    await saveClinicSettings(prisma, { values: values({ displayName: "B" }), expectedVersion: 1, actor: actor() });
    await assert.rejects(
      saveClinicSettings(prisma, { values: values({ displayName: "C" }), expectedVersion: 1, actor: actor() }),
      SettingsConflictError,
    );
    const row = await prisma.clinicSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID } });
    assert.equal(row.displayName, "B");
    assert.equal(row.version, 2);
  });

  it("duas gravações simultâneas com a mesma versão: uma vence, a outra recebe conflito", async () => {
    await saveClinicSettings(prisma, { values: values({ displayName: "Base" }), expectedVersion: 0, actor: actor() });
    const results = await Promise.allSettled([
      saveClinicSettings(prisma, { values: values({ displayName: "X" }), expectedVersion: 1, actor: actor() }),
      saveClinicSettings(prisma, { values: values({ displayName: "Y" }), expectedVersion: 1, actor: actor() }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof SettingsConflictError);
    const row = await prisma.clinicSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID } });
    assert.equal(row.version, 2);
  });

  it("duas primeiras gravações simultâneas: só uma cria a linha", async () => {
    const results = await Promise.allSettled([
      saveClinicSettings(prisma, { values: values({ displayName: "P" }), expectedVersion: 0, actor: actor() }),
      saveClinicSettings(prisma, { values: values({ displayName: "Q" }), expectedVersion: 0, actor: actor() }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await prisma.clinicSettings.count(), 1);
  });

  it("falha ao auditar desfaz a gravação da configuração (atomicidade)", async () => {
    await assert.rejects(
      saveClinicSettings(prisma, {
        values: values({ displayName: "Não deve ficar" }),
        expectedVersion: 0,
        // Perfil inexistente: o INSERT na auditoria falha dentro da mesma transação.
        actor: { id: adminId, role: "PERFIL_INEXISTENTE" as Role, ip: null },
      }),
    );
    assert.equal(await prisma.clinicSettings.count(), 0);
  });

  it("sem mudança real, não grava nem audita", async () => {
    await saveClinicSettings(prisma, { values: values({ displayName: "Igual" }), expectedVersion: 0, actor: actor() });
    const before = (await auditsOf(adminId)).length;
    const result = await saveClinicSettings(prisma, {
      values: values({ displayName: "Igual" }),
      expectedVersion: 1,
      actor: actor(),
    });
    assert.deepEqual(result, { version: 1, fields: [] });
    assert.equal((await auditsOf(adminId)).length, before);
  });

  it("CHECKs do banco recusam linha extra, faixa invertida, duração fora do limite e CNPJ não numérico", async () => {
    const base = { updatedById: adminId };
    await assert.rejects(prisma.clinicSettings.create({ data: { ...base, id: 2 } }), /ClinicSettings_singleton|check/i);
    await assert.rejects(
      prisma.clinicSettings.create({ data: { ...base, agendaDayStartHour: 10, agendaDayEndHour: 9 } }),
      /ClinicSettings_day_range|check/i,
    );
    await assert.rejects(
      prisma.clinicSettings.create({ data: { ...base, suggestedDurationMinutes: 721 } }),
      /ClinicSettings_duration|check/i,
    );
    await assert.rejects(
      prisma.clinicSettings.create({ data: { ...base, cnpj: "11.222.333/00" } }),
      /ClinicSettings_cnpj_digits|check/i,
    );
    assert.equal(await prisma.clinicSettings.count(), 0);
  });
});
