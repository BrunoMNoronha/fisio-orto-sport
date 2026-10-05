// A migração das cobranças (FIN-01, #86) é aditiva: aplicada sobre o schema anterior com dados
// fictícios, não altera nenhuma linha existente e só acrescenta a tabela, o enum e as proteções.
// Banco próprio, criado e descartado aqui (INTEGRATION_DATABASE_URL só fornece o servidor).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Client } from "pg";

const base = process.env.INTEGRATION_DATABASE_URL;
const MIGRATION = "20261005120000_financeiro_cobrancas";
const TABLES = ["User", "Patient", "Appointment", "ScheduleBlock", "ClinicSettings", "AuditLog"];

describe("migração do financeiro preserva dados (#86)", { skip: !base }, () => {
  it("aplica sobre o schema anterior com dados existentes intactos", async () => {
    const name = `financeiro_migration_${Date.now()}`;
    const admin = new Client({ connectionString: base });
    await admin.connect();
    let db: Client | undefined;
    try {
      await admin.query(`CREATE DATABASE "${name}"`);
      const url = new URL(base!);
      url.pathname = `/${name}`;
      db = new Client({ connectionString: url.toString() });
      await db.connect();
      const directories = readdirSync("prisma/migrations").filter((entry) => entry !== "migration_lock.toml").sort();
      assert.ok(directories.includes(MIGRATION));
      for (const directory of directories) {
        if (directory === MIGRATION) break;
        await db.query(readFileSync(`prisma/migrations/${directory}/migration.sql`, "utf8"));
      }
      await db.query(`INSERT INTO "User" (id,name,email,"passwordHash",role,"updatedAt") VALUES ('mig-fisio','FISIO','mig-fin@test.local','x','FISIOTERAPEUTA',now());
        INSERT INTO "Patient" (id,"fullName","birthDate",phone,"updatedAt","createdById","updatedById") VALUES ('mig-patient','PACIENTE','1990-01-01','11999999999',now(),'mig-fisio','mig-fisio');
        INSERT INTO "Appointment" (id,"patientId","professionalId","startsAt","endsAt","updatedAt","createdById","updatedById") VALUES ('mig-appointment','mig-patient','mig-fisio','2099-01-01 12:00Z','2099-01-01 13:00Z',now(),'mig-fisio','mig-fisio');
        INSERT INTO "ScheduleBlock" (id,"professionalId","startsAt","endsAt","createdById") VALUES ('mig-block','mig-fisio','2099-02-01 12:00Z','2099-02-01 13:00Z','mig-fisio');
        INSERT INTO "ClinicSettings" (id,"updatedById","updatedAt","displayName",version) VALUES (1,'mig-fisio',now(),'CLINICA EXISTENTE',4);
        INSERT INTO "AuditLog" (id,action,result,"actorId") VALUES ('mig-audit','LOGIN','SUCESSO','mig-fisio');`);
      const snapshot = async () => {
        const result: Record<string, unknown[]> = {};
        for (const table of TABLES) result[table] = (await db!.query(`SELECT * FROM "${table}" ORDER BY 1`)).rows;
        return result;
      };
      const before = await snapshot();

      await db.query(readFileSync(`prisma/migrations/${MIGRATION}/migration.sql`, "utf8"));

      assert.deepEqual(await snapshot(), before);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM "Charge"`)).rows[0].n, 0);
      const triggers = await db.query(
        `SELECT tgname FROM pg_trigger WHERE tgrelid = '"Charge"'::regclass AND NOT tgisinternal ORDER BY tgname`,
      );
      assert.deepEqual(triggers.rows.map((t) => t.tgname), ["Charge_immutable", "Charge_replacement_cancelled"]);
      const checks = await db.query(
        `SELECT conname FROM pg_constraint WHERE conrelid = '"Charge"'::regclass AND contype = 'c' ORDER BY conname`,
      );
      assert.deepEqual(checks.rows.map((c) => c.conname), [
        "Charge_amount_positive",
        "Charge_cancellation_consistent",
        "Charge_description_not_blank",
        "Charge_not_self_replacement",
      ]);
      // Vínculos protegidos: paciente e autores com Restrict (sem cascata).
      const fks = await db.query(
        `SELECT conname, confdeltype FROM pg_constraint WHERE conrelid = '"Charge"'::regclass AND contype = 'f' ORDER BY conname`,
      );
      assert.ok(fks.rows.length === 4 && fks.rows.every((fk) => fk.confdeltype === "r"));
      // Um lançamento novo funciona sobre os dados antigos.
      await db.query(`INSERT INTO "Charge" (id,"patientId",description,"amountCents","dueDate","idempotencyKey","createdById")
        VALUES ('mig-charge','mig-patient','Cobrança fictícia',100,'2026-10-31','mig-key','mig-fisio')`);
    } finally {
      await db?.end();
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });
});
