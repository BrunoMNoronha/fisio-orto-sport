// Aplica FIN-02 sobre todas as migrações anteriores, incluindo cobranças com histórico.
// Usa banco próprio descartável e compara cada linha existente antes/depois da migração.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Client } from "pg";

const base = process.env.INTEGRATION_DATABASE_URL;
const MIGRATION = "20261006010000_financeiro_pagamentos";
if (process.env.CI && !base) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

describe("migração de pagamentos preserva dados (#87)", { skip: !base }, () => {
  it("adiciona histórico protegido sem alterar pacientes, autores, agenda ou cobranças prévias", async () => {
    const name = `fin02_migration_${Date.now()}`;
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
      await db.query(`INSERT INTO "User" (id,name,email,"passwordHash",role,"updatedAt")
          VALUES ('fin02-mig-user','FISIO FICTICIO','fin02-mig@example.test','x','FISIOTERAPEUTA',now());
        INSERT INTO "Patient" (id,"fullName","birthDate",phone,"updatedAt","createdById","updatedById")
          VALUES ('fin02-mig-patient','PACIENTE FICTICIO','1990-01-01','11999999999',now(),'fin02-mig-user','fin02-mig-user');
        INSERT INTO "Appointment" (id,"patientId","professionalId","startsAt","endsAt","updatedAt","createdById","updatedById")
          VALUES ('fin02-mig-appointment','fin02-mig-patient','fin02-mig-user','2099-01-01 12:00Z','2099-01-01 13:00Z',now(),'fin02-mig-user','fin02-mig-user');
        INSERT INTO "ScheduleBlock" (id,"professionalId","startsAt","endsAt","createdById")
          VALUES ('fin02-mig-block','fin02-mig-user','2099-02-01 12:00Z','2099-02-01 13:00Z','fin02-mig-user');
        INSERT INTO "ClinicSettings" (id,"updatedById","updatedAt","displayName",version)
          VALUES (1,'fin02-mig-user',now(),'CLINICA FICTICIA',4);
        INSERT INTO "AuditLog" (id,action,result,"actorId") VALUES ('fin02-mig-audit','LOGIN','SUCESSO','fin02-mig-user');
        INSERT INTO "Charge" (id,"patientId",description,"amountCents","dueDate","idempotencyKey","createdById")
          VALUES ('fin02-mig-active','fin02-mig-patient','Cobrança ativa fictícia',10000,'2026-01-01','fin02-mig-active-key','fin02-mig-user'),
                 ('fin02-mig-original','fin02-mig-patient','Original fictícia',12000,'2026-01-01','fin02-mig-original-key','fin02-mig-user');
        UPDATE "Charge" SET status = 'CANCELADA', "cancelledAt" = now(), "cancelledById" = 'fin02-mig-user', "cancelReason" = 'Correção fictícia'
          WHERE id = 'fin02-mig-original';
        INSERT INTO "Charge" (id,"patientId",description,"amountCents","dueDate","idempotencyKey","createdById","replacesChargeId")
          VALUES ('fin02-mig-replacement','fin02-mig-patient','Substituta fictícia',11000,'2026-01-01','fin02-mig-replacement-key','fin02-mig-user','fin02-mig-original');`);

      const tables = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).rows.map((row) => row.tablename as string);
      const snapshot = async () => {
        const result: Record<string, unknown[]> = {};
        for (const table of tables) {
          // Os nomes vêm do catálogo PostgreSQL, e não de entrada externa.
          result[table] = (await db!.query(`SELECT * FROM "${table.replaceAll('"', '""')}" ORDER BY 1`)).rows;
        }
        return result;
      };
      const before = await snapshot();
      await db.query(readFileSync(`prisma/migrations/${MIGRATION}/migration.sql`, "utf8"));
      assert.deepEqual(await snapshot(), before);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM "Payment"`)).rows[0].n, 0);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM "PaymentReversal"`)).rows[0].n, 0);
      const triggers = await db.query(`SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname IN ('Charge','Payment','PaymentReversal') AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`);
      assert.deepEqual(triggers.rows, [
        { relname: "Charge", tgname: "Charge_immutable" },
        { relname: "Charge", tgname: "Charge_replacement_cancelled" },
        { relname: "Payment", tgname: "Payment_immutable" },
        { relname: "Payment", tgname: "Payment_insert_valid" },
        { relname: "PaymentReversal", tgname: "PaymentReversal_immutable" },
        { relname: "PaymentReversal", tgname: "PaymentReversal_insert_valid" },
      ]);
      const fks = await db.query(`SELECT conname,confdeltype FROM pg_constraint
        WHERE conrelid IN ('"Payment"'::regclass,'"PaymentReversal"'::regclass) AND contype = 'f' ORDER BY conname`);
      assert.equal(fks.rows.length, 5);
      assert.ok(fks.rows.every((fk) => fk.confdeltype === "r"));
      const checks = await db.query(`SELECT count(*)::int AS n FROM pg_constraint
        WHERE conrelid IN ('"Payment"'::regclass,'"PaymentReversal"'::regclass) AND contype = 'c'`);
      assert.equal(checks.rows[0].n, 9);

      const fingerprint = `v1:${"a".repeat(64)}`;
      await db.query(`INSERT INTO "Payment" (id,"chargeId","amountCents","receivedOn","createdById","idempotencyKey",fingerprint)
        VALUES ('fin02-mig-payment','fin02-mig-active',3000,'2026-01-02','fin02-mig-user','RECEBIMENTO:fin02-mig-receipt',$1)`, [fingerprint]);
      await assert.rejects(db.query(`UPDATE "Charge" SET status='CANCELADA', "cancelledAt"=now(), "cancelledById"='fin02-mig-user', "cancelReason"='x'
        WHERE id='fin02-mig-active'`), (error: { code?: string }) => error.code === "23514");
      await db.query(`INSERT INTO "PaymentReversal" (id,"paymentId",reason,"reversedOn","createdById","idempotencyKey",fingerprint)
        VALUES ('fin02-mig-reversal','fin02-mig-payment','Correção fictícia','2026-01-03','fin02-mig-user','ESTORNO:fin02-mig-reversal',$1)`, [fingerprint]);
      await db.query(`UPDATE "Charge" SET status='CANCELADA', "cancelledAt"=now(), "cancelledById"='fin02-mig-user', "cancelReason"='x'
        WHERE id='fin02-mig-active'`);
      // A reinicialização manual usa TRUNCATE, e permanece compatível com os guards.
      await db.query(`TRUNCATE TABLE "PaymentReversal", "Payment", "Charge"`);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM "PaymentReversal"`)).rows[0].n, 0);
    } finally {
      await db?.end();
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });
});
