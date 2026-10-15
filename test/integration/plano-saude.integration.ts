// Apenas PostgreSQL descartável definido por INTEGRATION_DATABASE_URL.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { patientSchema, updatePatientSchema } from "@/modules/pacientes/validation";

const url = process.env.INTEGRATION_DATABASE_URL;
const keys = ["healthInsuranceProvider", "healthInsurancePlan", "healthInsuranceCard", "healthInsuranceValidUntil"] as const;
describe("plano de saúde cadastral no PostgreSQL (#85)", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let prisma: PrismaClient;
  let actorId: string;
  before(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    actorId = (await prisma.user.create({ data: { name: "ADMIN TESTE 85", email: `admin-85-${Date.now()}@teste.local`, passwordHash: "x", role: "ADMIN" } })).id;
  });
  after(async () => { await prisma?.$disconnect(); });
  it("migração mantém um paciente anterior com colunas novas nulas", async () => {
    const pool = new Pool({ connectionString: url! });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query('CREATE SCHEMA teste_migracao_85');
      await client.query('SET LOCAL search_path TO teste_migracao_85, public');
      await client.query('CREATE TABLE teste_migracao_85."Patient" (LIKE public."Patient" INCLUDING DEFAULTS INCLUDING CONSTRAINTS)');
      for (const key of keys) await client.query(`ALTER TABLE teste_migracao_85."Patient" DROP COLUMN "${key}"`);
      await client.query(`INSERT INTO teste_migracao_85."Patient" (id, "fullName", "birthDate", phone, "updatedAt", "createdById", "updatedById") VALUES ('legado85', 'PACIENTE LEGADO 85', '1990-01-01', '11987654321', now(), $1, $1)`, [actorId]);
      await client.query(readFileSync("prisma/migrations/20261005022000_plano_saude_paciente/migration.sql", "utf8"));
      const { rows } = await client.query('SELECT * FROM teste_migracao_85."Patient" WHERE id = $1', ["legado85"]);
      assert.equal(rows[0].fullName, "PACIENTE LEGADO 85");
      assert.equal(rows[0].phone, "11987654321");
      for (const key of keys) assert.equal(rows[0][key], null);
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });
  it("cria, relê, edita e limpa com preservação de carteirinha e data civil", async () => {
    const base = { fullName: "PACIENTE TESTE 85", birthDate: "1990-01-01", sex: "NAO_INFORMADO", phone: "11987654321" };
    const data = patientSchema.parse({ ...base, healthInsuranceProvider: " Operadora Fictícia ", healthInsurancePlan: " Plano Fictício ", healthInsuranceCard: " 000Ab-12/3 ", healthInsuranceValidUntil: "2024-02-29" });
    const { id } = await prisma.patient.create({ data: { ...data, createdById: actorId, updatedById: actorId } });
    const saved = await prisma.patient.findUniqueOrThrow({ where: { id } });
    assert.equal(saved.healthInsuranceProvider, "Operadora Fictícia");
    assert.equal(saved.healthInsuranceCard, "000Ab-12/3");
    assert.equal(saved.healthInsuranceValidUntil?.toISOString(), "2024-02-29T00:00:00.000Z");
    const { id: updateId, ...update } = updatePatientSchema.parse({ ...base, id, healthInsuranceCard: "000CD", healthInsuranceValidUntil: "2999-12-31" });
    assert.equal(updateId, id);
    await prisma.patient.update({ where: { id }, data: { ...update, updatedById: actorId } });
    const edited = await prisma.patient.findUniqueOrThrow({ where: { id } });
    assert.equal(edited.healthInsuranceCard, "000CD");
    assert.equal(edited.healthInsuranceValidUntil?.toISOString(), "2999-12-31T00:00:00.000Z");
    const { id: clearId, ...cleared } = updatePatientSchema.parse({ ...base, id, ...Object.fromEntries(keys.map((key) => [key, ""])) });
    assert.equal(clearId, id);
    await prisma.patient.update({ where: { id }, data: cleared });
    const empty = await prisma.patient.findUniqueOrThrow({ where: { id } });
    for (const key of keys) assert.equal(empty[key], null);
  });
});
