import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { Client } from "pg";
const base = process.env.INTEGRATION_DATABASE_URL;
const migration = "20261014170000_administrativo_operadoras";
describe("migração administrativa aditiva (#97)", { skip: !base }, () => {
  it("preserva cadastro legado, clínica, usuários e financeiro sem criar vínculos automáticos", async () => {
    const name = `adm_migration_${randomUUID().replaceAll("-","")}`;
    const admin = new Client({ connectionString: base }); await admin.connect();
    let db: Client | undefined;
    try {
      await admin.query(`CREATE DATABASE "${name}"`);
      const url = new URL(base!); url.pathname = `/${name}`;
      db = new Client({ connectionString: url.toString() }); await db.connect();
      const directories = readdirSync("prisma/migrations").filter((v) => v !== "migration_lock.toml").sort();
      for (const directory of directories) {
        if (directory === migration) break;
        await db.query(readFileSync(`prisma/migrations/${directory}/migration.sql`, "utf8"));
      }
      await db.query(`INSERT INTO "User" (id,name,email,"passwordHash",role,"updatedAt") VALUES ('legacy-user','FISIO SINTETICO','legacy-adm@example.test','x','FISIOTERAPEUTA',now());
        INSERT INTO "Patient" (id,"fullName","birthDate",phone,"updatedAt","createdById","updatedById","healthInsuranceProvider","healthInsuranceCard")
        VALUES ('legacy-patient','PACIENTE SINTETICO','1990-01-01','11999999999',now(),'legacy-user','legacy-user','OPERADORA TEXTO LIVRE','000123');
        INSERT INTO "ClinicSettings" (id,"updatedById","updatedAt","displayName",version) VALUES (1,'legacy-user',now(),'CLINICA SINTETICA',2);
        INSERT INTO "Charge" (id,"patientId",description,"amountCents","dueDate","idempotencyKey","createdById")
        VALUES ('legacy-charge','legacy-patient','Lançamento sintético',12345,'2026-10-01','legacy-key','legacy-user');`);
      const snapshot = async () => {
        const result: unknown[] = [];
        for (const table of ["User","Patient","ClinicSettings","Charge","Payment","PaymentReversal"]) result.push((await db!.query(`SELECT * FROM "${table}" ORDER BY id`)).rows);
        return result;
      };
      const before = await snapshot();
      await db.query(readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
      assert.deepEqual(await snapshot(), before);
      for (const table of ["HealthOperator","OperatorContract","BillingProcedure","ProcedureTariff","BillingProfessional","AdministrativeConfigChange"]) {
        assert.equal((await db.query(`SELECT count(*)::int n FROM "${table}"`)).rows[0].n,0);
      }
      assert.equal((await db.query(`SELECT count(*)::int n FROM pg_constraint WHERE conname='ProcedureTariff_no_overlap'`)).rows[0].n,1);
    } finally {
      await db?.end();
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });
});
