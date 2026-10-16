import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Client } from "pg";

const base = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !base) throw new Error("INTEGRATION_DATABASE_URL obrigatória.");
describe("migração de recorrência preserva dados (#132)", { skip: !base }, () => {
  it("preserva agendamentos/configurações e acrescenta limite padrão 10", async () => {
    const name = `recurrence_migration_${Date.now()}`;
    const admin = new Client({ connectionString: base }); await admin.connect();
    let db: Client | undefined;
    try {
      await admin.query(`CREATE DATABASE "${name}"`);
      const target = new URL(base!); target.pathname = `/${name}`;
      db = new Client({ connectionString: target.toString() }); await db.connect();
      const migration = "20261016140000_recurring_appointments";
      for (const directory of readdirSync("prisma/migrations").sort()) {
        if (directory === migration) break;
        if (directory !== "migration_lock.toml") await db.query(readFileSync(`prisma/migrations/${directory}/migration.sql`, "utf8"));
      }
      await db.query(`INSERT INTO "User" (id,name,email,"passwordHash",role,"updatedAt") VALUES ('migration-fisio','FISIO','migration@test.local','x','FISIOTERAPEUTA',now());
        INSERT INTO "Patient" (id,"fullName","birthDate",phone,"updatedAt","createdById","updatedById") VALUES ('migration-patient','PACIENTE','1990-01-01','11999999999',now(),'migration-fisio','migration-fisio');
        INSERT INTO "Appointment" (id,"patientId","professionalId","startsAt","endsAt","updatedAt","createdById","updatedById") VALUES ('migration-appointment','migration-patient','migration-fisio','2099-01-01 12:00Z','2099-01-01 13:00Z',now(),'migration-fisio','migration-fisio');
        INSERT INTO "ClinicSettings" (id,"updatedById","updatedAt","displayName",version) VALUES (1,'migration-fisio',now(),'CLINICA EXISTENTE',7);`);
      const original = (await db.query('SELECT * FROM "Appointment"')).rows[0];
      const settings = (await db.query('SELECT * FROM "ClinicSettings"')).rows[0];
      await db.query(readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
      const after = (await db.query('SELECT * FROM "Appointment"')).rows[0];
      assert.equal(after.batchId, null); delete after.batchId;
      assert.deepEqual(after, original);
      const newSettings = (await db.query('SELECT * FROM "ClinicSettings"')).rows[0];
      assert.equal(newSettings.maxRecurringSessions, 10); delete newSettings.maxRecurringSessions;
      assert.deepEqual(newSettings, settings);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM "AppointmentBatch"')).rows[0].n, 0);
    } finally {
      await db?.end(); await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await admin.end();
    }
  });
});
