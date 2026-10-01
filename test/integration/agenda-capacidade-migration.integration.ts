import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Client } from 'pg';
const base = process.env.INTEGRATION_DATABASE_URL;
describe('migration de capacidade preserva dados (#82)', { skip: !base }, () => {
  it('aplica sobre schema anterior com agendamento e configurações existentes intactos', async () => {
    const name = `capacity_migration_${Date.now()}`;
    const admin = new Client({ connectionString: base }); await admin.connect();
    let db: Client | undefined;
    try {
      await admin.query(`CREATE DATABASE "${name}"`);
      const url = new URL(base!); url.pathname = `/${name}`;
      db = new Client({ connectionString: url.toString() }); await db.connect();
      const migration = '20261001000000_agenda_capacity';
      for (const directory of readdirSync('prisma/migrations').sort()) {
        if (directory === migration) break;
        if (directory === 'migration_lock.toml') continue;
        await db.query(readFileSync(`prisma/migrations/${directory}/migration.sql`, 'utf8'));
      }
      await db.query(`INSERT INTO "User" (id,name,email,"passwordHash",role,"updatedAt") VALUES ('migration-fisio','FISIO','migration@test.local','x','FISIOTERAPEUTA',now());
        INSERT INTO "Patient" (id,"fullName","birthDate",phone,"updatedAt","createdById","updatedById") VALUES ('migration-patient','PACIENTE','1990-01-01','11999999999',now(),'migration-fisio','migration-fisio');
        INSERT INTO "Appointment" (id,"patientId","professionalId","startsAt","endsAt","updatedAt","createdById","updatedById") VALUES ('migration-appointment','migration-patient','migration-fisio','2099-01-01 12:00Z','2099-01-01 13:00Z',now(),'migration-fisio','migration-fisio');
        INSERT INTO "ClinicSettings" (id,"updatedById","updatedAt","displayName",version) VALUES (1,'migration-fisio',now(),'CLINICA EXISTENTE',7);`);
      const appointment = (await db.query('SELECT * FROM "Appointment"')).rows;
      const settings = (await db.query('SELECT * FROM "ClinicSettings"')).rows[0];
      await db.query(readFileSync(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
      assert.deepEqual((await db.query('SELECT * FROM "Appointment"')).rows, appointment);
      const after = (await db.query('SELECT * FROM "ClinicSettings"')).rows[0];
      assert.equal(after.maxSimultaneousAppointments, 3);
      delete after.maxSimultaneousAppointments;
      assert.deepEqual(after, settings);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'Appointment_capacity' AND NOT tgisinternal`)).rows[0].n, 1);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'Appointment_no_overlap'`)).rows[0].n, 0);
    } finally {
      await db?.end(); await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await admin.end();
    }
  });
});
