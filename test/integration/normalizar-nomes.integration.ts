// Integração do `pnpm db:normalizar-nomes` (issue #78). Como a ferramenta regrava nomes em várias
// tabelas e as demais suítes rodam em paralelo, este teste cria um banco PRÓPRIO e o descarta no fim.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { AdminCliIO } from "@/modules/auth/admin-cli";
import { runNamesCli, type NamesHooks } from "@/modules/manutencao/names-cli";

const baseUrl = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !baseUrl) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

describe("db:normalizar-nomes no PostgreSQL", { skip: !baseUrl && "INTEGRATION_DATABASE_URL não definida" }, () => {
  const dbName = `nomes_it_${Date.now()}`;
  let url: string;
  let admin: Client;
  let raw: Client;
  let prisma: PrismaClient;
  const ids = {} as Record<"user" | "patient" | "adult" | "anamnesis", string>;

  const run = (argv: string[], answers: string[] = [], hooks?: NamesHooks) => {
    const out: string[] = [];
    const err: string[] = [];
    const queue = [...answers];
    const io: AdminCliIO = { ask: async () => queue.shift() ?? "", out: (m) => out.push(m), err: (m) => err.push(m) };
    const openDb = (cs: string) => new PrismaClient({ adapter: new PrismaPg({ connectionString: cs }) });
    return runNamesCli(argv, url, io, openDb, hooks).then((code) => ({ code, out, err }));
  };

  const row = async (table: string, id: string | number) =>
    (await raw.query(`SELECT * FROM "${table}" WHERE id = $1`, [id])).rows[0];

  before(async () => {
    admin = new Client({ connectionString: baseUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${dbName}"`);
    const target = new URL(baseUrl!);
    target.pathname = `/${dbName}`;
    url = target.toString();
    execSync("pnpm exec prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    raw = new Client({ connectionString: url });
    await raw.connect();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

    // Dados gravados antes do contrato (direto no banco, sem passar pelos schemas).
    const user = await prisma.user.create({
      data: { name: "  Fisio  Antiga ", email: "fisio@teste.local", passwordHash: "hash-x", role: "FISIOTERAPEUTA", crefito: "1-F" },
    });
    ids.user = user.id;
    const patient = await prisma.patient.create({
      data: {
        fullName: "joão menor",
        birthDate: new Date("2020-01-01"),
        phone: "11999999999",
        guardianName: "Márcia Responsável",
        guardianRelationship: "mãe",
        address: "rua das flores",
        createdById: user.id,
        updatedById: user.id,
      },
    });
    ids.patient = patient.id;
    const adult = await prisma.patient.create({
      data: { fullName: "JÁ CERTO", birthDate: new Date("1990-01-01"), phone: "11999999998", createdById: user.id, updatedById: user.id },
    });
    ids.adult = adult.id;
    await prisma.clinicSettings.create({ data: { id: 1, displayName: "Clínica Teste", legalName: "clínica ltda", address: "av. central", updatedById: user.id } });
    const anamnesis = await prisma.anamnesis.create({
      data: { patientId: patient.id, authorId: user.id, authorNameSnapshot: "Fisio Antiga", assessmentDate: new Date("2026-09-01"), chiefComplaint: "Dor" },
    });
    ids.anamnesis = anamnesis.id;
    await prisma.auditLog.create({ data: { action: "USUARIO_CRIADO", result: "SUCESSO", actorId: user.id, actorRole: "ADMIN" } });
  });

  after(async () => {
    await prisma?.$disconnect();
    await raw?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin.end();
    }
  });

  it("simulação mostra contagens por campo, sem nomes e sem escrever", async () => {
    const before = await row("User", ids.user);
    const result = await run([]);
    assert.equal(result.code, 0);
    const text = result.out.join("\n");
    assert.match(text, /Modo: simulação/);
    assert.match(text, /User\.name\s+1/);
    assert.match(text, /Patient\.fullName\s+1/);
    assert.match(text, /Patient\.guardianName\s+1/);
    assert.match(text, /ClinicSettings\.displayName\s+1/);
    assert.match(text, /ClinicSettings\.legalName\s+1/);
    assert.doesNotMatch(text, /Fisio Antiga|joão|Márcia|fisio_ci_password|fisio_dev_password/);
    assert.deepEqual(await row("User", ids.user), before);
  });

  it("confirmação errada cancela; falha intermediária desfaz tudo", async () => {
    const before = await row("Patient", ids.patient);
    assert.equal((await run(["--executar"], ["outro_banco"])).code, 1);
    const failed = await run(["--executar"], [dbName], {
      afterUpdate: async () => {
        throw new Error("falha simulada");
      },
    });
    assert.equal(failed.code, 1);
    assert.deepEqual(await row("Patient", ids.patient), before);
  });

  it("executa só nos nomes cadastrais e é idempotente", async () => {
    const userBefore = await row("User", ids.user);
    const patientBefore = await row("Patient", ids.patient);
    const adultBefore = await row("Patient", ids.adult);
    const anamnesisBefore = await row("Anamnesis", ids.anamnesis);
    const auditBefore = (await raw.query(`SELECT * FROM "AuditLog" ORDER BY id`)).rows;

    const result = await run(["--executar"], [dbName]);
    assert.equal(result.code, 0, result.err.join("\n"));
    assert.match(result.out.join("\n"), /Nomes adequados: 5/);

    const user = await row("User", ids.user);
    assert.equal(user.name, "FISIO ANTIGA");
    // Adequação técnica: nenhum outro campo muda, nem updatedAt.
    assert.deepEqual({ ...user, name: userBefore.name }, userBefore);

    const patient = await row("Patient", ids.patient);
    assert.equal(patient.fullName, "JOÃO MENOR");
    assert.equal(patient.guardianName, "MÁRCIA RESPONSÁVEL");
    assert.equal(patient.guardianRelationship, "mãe");
    assert.equal(patient.address, "rua das flores");
    assert.deepEqual(patient.updatedAt, patientBefore.updatedAt);
    assert.equal(patient.searchName, "joao menor");
    assert.deepEqual(await row("Patient", ids.adult), adultBefore);

    const settings = await row("ClinicSettings", 1);
    assert.equal(settings.displayName, "CLÍNICA TESTE");
    assert.equal(settings.legalName, "CLÍNICA LTDA");
    assert.equal(settings.address, "av. central");

    // Snapshot clínico e auditoria intactos.
    assert.deepEqual(await row("Anamnesis", ids.anamnesis), anamnesisBefore);
    assert.deepEqual((await raw.query(`SELECT * FROM "AuditLog" ORDER BY id`)).rows, auditBefore);

    const again = await run(["--executar"], [dbName]);
    assert.equal(again.code, 0);
    assert.match(again.out.join("\n"), /Nada a adequar/);
  });
});
