import {saveTissProfile} from "@/modules/administrativo/tiss/profile-service";
import {TISS_DEFAULTS} from "@/modules/administrativo/tiss/profile";
import {saveSettlement} from "@/modules/administrativo/settlement-service";
import {settlementSchema} from "@/modules/administrativo/settlement-validation";
import {saveBatch,registerValidatedBatchArtifactTx} from "@/modules/administrativo/batch-service";
import {batchSchema} from "@/modules/administrativo/batch-validation";
import { saveGuide,saveGuideProfile } from "@/modules/administrativo/guide-service";
import { guideSchema,DEFAULT_GUIDE_RULES } from "@/modules/administrativo/guide-validation";
import { saveProduction } from "@/modules/administrativo/production-service";
import { productionSchema } from "@/modules/administrativo/production-validation";
import { CONTRACT_DEFAULTS } from "@/modules/administrativo/contract-defaults";
// Integração do `pnpm db:reset` (issue #62) com PostgreSQL real. Como a ferramenta esvazia tabelas e
// as demais suítes rodam em paralelo no banco de INTEGRATION_DATABASE_URL, este teste cria um banco
// PRÓPRIO (CREATE DATABASE), aplica as migrações nele, semeia dados fictícios de todas as tabelas e o
// descarta no fim. Exige permissão CREATEDB (o usuário da CI e do Docker local têm).
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { AdminCliIO } from "@/modules/auth/admin-cli";
import { CLEARED_TABLES, PRESERVED_TABLES, runResetCli, type ResetHooks } from "@/modules/manutencao/reset-cli";
import { saveAdministrativeConfig } from "@/modules/administrativo/service";
import { seedBeneficiary } from "./beneficiary-fixture";
import { consumeAuthorization } from "@/modules/administrativo/beneficiary-service";
import { createPayment, reversePayment } from "@/modules/financeiro/payment-service";

const baseUrl = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !baseUrl) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

describe("db:reset no PostgreSQL", { skip: !baseUrl && "INTEGRATION_DATABASE_URL não definida" }, () => {
  const dbName = `reset_it_${Date.now()}`;
  let url: string;
  let admin: Client;
  let raw: Client;
  let prisma: PrismaClient;
  const openDb = (connectionString: string) => new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  function io(answers: string[] = []) {
    const out: string[] = [];
    const err: string[] = [];
    const queue = [...answers];
    const handle: AdminCliIO = {
      ask: async () => queue.shift() ?? "",
      out: (message) => out.push(message),
      err: (message) => err.push(message),
    };
    return { handle, out, err };
  }

  const run = (argv: string[], answers: string[] = [], hooks?: ResetHooks) => {
    const console = io(answers);
    return runResetCli(argv, url, console.handle, openDb, hooks).then((code) => ({ code, ...console }));
  };

  async function countAll() {
    const result: Record<string, number> = {};
    for (const table of [...CLEARED_TABLES, "AuditLog", ...PRESERVED_TABLES]) {
      result[table] = (await raw.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n;
    }
    return result;
  }

  // Todos os campos de todos os usuários (inclusive hash), só para comparar.
  const usersSnapshot = async () => (await raw.query(`SELECT * FROM "User" ORDER BY id`)).rows;
  const administrativeSnapshot = async () => {
    const rows = [];
    for (const table of ["HealthOperator", "OperatorContract", "BillingProcedure", "ProcedureTariff", "BillingProfessional", "AdministrativeConfigChange", "ProcedureAuthorizationRule"]) rows.push((await raw.query(`SELECT * FROM "${table}" ORDER BY id`)).rows);
    return rows;
  };

  // Dados fictícios de todas as tabelas, com a referência cruzada revisão do plano ↔ reavaliação.
  async function seed() {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const user = (name: string, role: "ADMIN" | "FISIOTERAPEUTA" | "RECEPCAO", extra = {}) =>
      prisma.user.create({
        data: { name, email: `${name.toLowerCase()}-${suffix}@teste.local`, passwordHash: `hash-${name}`, role, ...extra },
        select: { id: true },
      });
    const adm = await user("Adm", "ADMIN");
    const operatorId = randomUUID();
    await saveAdministrativeConfig(prisma, adm.id, { kind: "operator", values: {
      id: operatorId, requestId: randomUUID(), expectedVersion: 0, name: `OPERADORA SINTETICA ${suffix}`, registrationAns: String(Math.floor(100000+Math.random()*899999)), active: true, reason: "Teste de preservação",
    } });
    const contractId = randomUUID();
    await saveAdministrativeConfig(prisma, adm.id, { kind: "contract", values: {
      id: contractId, requestId: randomUUID(), expectedVersion: 0, operatorId, name: "CONTRATO SINTETICO", providerCode: "SINT", cnes: null,
      tissVersion: "04.03.00", manualReference: "Manual sintético", homologationChannel: null, ...CONTRACT_DEFAULTS, active: true, reason: "Teste de preservação",
    } });
    await saveTissProfile(prisma,adm.id,{id:randomUUID(),requestId:randomUUID(),expectedVersion:0,reason:"Perfil sintético preservado",contractId,data:TISS_DEFAULTS});
    const fisio = await user("Fisio", "FISIOTERAPEUTA", { crefito: `R${suffix}`.slice(0, 20) });
    const procedureId = randomUUID();
    await saveAdministrativeConfig(prisma, adm.id, { kind: "procedure", values: { id: procedureId, requestId: randomUUID(), expectedVersion: 0,
      contractId, name: "PROCEDIMENTO SINTETICO", tableCode: "00", code: "0001", active: true, reason: "Preservação" } });
    await saveAdministrativeConfig(prisma, adm.id, { kind: "tariff", values: { id: randomUUID(), requestId: randomUUID(), expectedVersion: 0,
      procedureId, amount: 12345, startsOn: new Date("2026-01-01T00:00:00Z"), endsOn: null, active: true, reason: "Preservação" } });
    await saveAdministrativeConfig(prisma, adm.id, { kind: "professional", values: { id: randomUUID(), requestId: randomUUID(), expectedVersion: 0,
      userId: fisio.id, name: "FISIO SINTETICO", purpose: "AMBOS", councilCode: "99", councilNumber: "SINT", councilState: "SP", occupationCode: "999999", active: true, reason: "Preservação" } });
    await user("Recep", "RECEPCAO", { active: false });
    const sign = { authorId: fisio.id, authorNameSnapshot: "Fisio" };

    await prisma.session.create({ data: { tokenHash: `t-${suffix}`, userId: adm.id, expiresAt: new Date("2099-01-01") } });
    await prisma.authRateLimit.create({ data: { key: suffix.padEnd(64, "0").slice(0, 64), count: 1, resetAt: new Date("2099-01-01") } });
    await prisma.clinicSettings.upsert({
      where: { id: 1 },
      update: {legalName:"CLINICA SINTETICA",cnpj:"99999999000199"},
      create: { id: 1, displayName: "Clínica Fictícia", legalName:"CLINICA SINTETICA",cnpj:"99999999000199",updatedById: adm.id },
    });
    await prisma.auditLog.create({ data: { action: "LOGIN", result: "SUCESSO", actorId: adm.id, actorRole: "ADMIN" } });

    const patient = await prisma.patient.create({
      data: { fullName: "Paciente Fictício", birthDate: new Date("1990-01-01"), phone: "11999999999", createdById: adm.id, updatedById: adm.id },
      select: { id: true },
    });
    // Cobrança cancelada e a substituta que aponta para ela (FK da própria tabela).
    const benefits = await seedBeneficiary(prisma,adm.id,{patientId:patient.id,contractId,procedureId});
    await consumeAuthorization(prisma,adm.id,{itemId:benefits.item.id,quantity:1,executionOn:"2026-01-15",sourceKey:randomUUID(),requestId:randomUUID(),reason:"Teste de limpeza autorizada"});
    const charge = await prisma.charge.create({
      data: { patientId: patient.id, description: "Cobrança fictícia", amountCents: 15000, dueDate: new Date("2026-10-10"), idempotencyKey: `c1-${suffix}`, createdById: adm.id },
      select: { id: true },
    });
    await prisma.charge.update({
      where: { id: charge.id },
      data: { status: "CANCELADA", cancelledAt: new Date(), cancelledById: adm.id, cancelReason: "Valor errado" },
    });
    const replacementCharge = await prisma.charge.create({
      data: { patientId: patient.id, description: "Cobrança fictícia", amountCents: 12000, dueDate: new Date("2026-10-10"), idempotencyKey: `c2-${suffix}`, replacesChargeId: charge.id, createdById: adm.id },
    });
    const originalPayment = await createPayment(prisma, fisio.id, {
      chargeId: replacementCharge.id, amountCents: 1000, receivedOn: new Date("2026-09-01"), requestId: `reset-pay-${suffix}`,
    });
    await reversePayment(prisma, adm.id, {
      paymentId: originalPayment.id, reason: "Correção fictícia", reversedOn: new Date("2026-09-02"), requestId: `reset-rev-${suffix}`,
    });
    await createPayment(prisma, fisio.id, {
      chargeId: replacementCharge.id, amountCents: 2000, receivedOn: new Date("2026-09-01"), requestId: `reset-sub-${suffix}`, replacesPaymentId: originalPayment.id,
    });
    const appointmentBatch = await prisma.appointmentBatch.create({
      data: { requestKey: randomUUID(), requestHash: "0".repeat(64), createdById: adm.id },
      select: { id: true },
    });
    const appointment = await prisma.appointment.create({
      data: {
        batchId: appointmentBatch.id,
        patientId: patient.id,
        professionalId: fisio.id,
        startsAt: new Date("2099-01-02T12:00:00Z"),
        endsAt: new Date("2099-01-02T13:00:00Z"),
        createdById: adm.id,
        updatedById: adm.id,
      },
      select: { id: true },
    });
    await prisma.appointmentBatch.update({ where: { id: appointmentBatch.id }, data: { appointmentIds: [appointment.id] } });
    await prisma.scheduleBlock.create({
      data: { professionalId: fisio.id, startsAt: new Date("2099-01-03T12:00:00Z"), endsAt: new Date("2099-01-03T15:00:00Z"), createdById: adm.id },
    });
    const anamnesis = await prisma.anamnesis.create({
      data: { patientId: patient.id, ...sign, assessmentDate: new Date("2026-09-01"), chiefComplaint: "Dor" },
    });
    const assessment = await prisma.assessment.create({
      data: { patientId: patient.id, anamnesisId: anamnesis.id, ...sign, assessmentDate: new Date("2026-09-01"), diagnosis: "Dx", rangeOfMotion: "90" },
    });
    await prisma.assessmentChange.create({
      data: { assessmentId: assessment.id, version: 2, field: "diagnosis", editorId: fisio.id, editorNameSnapshot: "Fisio" },
    });
    const plan = await prisma.therapyPlan.create({
      data: {
        patientId: patient.id,
        assessmentId: assessment.id,
        assessmentVersion: 1,
        ...sign,
        revisions: { create: { number: 1, kind: "INICIAL", planDate: new Date("2026-09-02"), goals: "G1", conduct: "C1", ...sign } },
      },
      select: { id: true, revisions: { select: { id: true } } },
    });
    await prisma.therapyPlanStatusChange.create({
      data: { planId: plan.id, fromStatus: "ATIVO", toStatus: "ENCERRADO", reason: "r", ...sign },
    });
    const session = await prisma.treatmentSession.create({
      data: {
        patientId: patient.id,
        planId: plan.id,
        planRevisionId: plan.revisions[0].id,
        appointmentId: appointment.id,
        occurredAt: new Date("2026-09-03T12:00:00Z"),
        professionalId: fisio.id,
        professionalNameSnapshot: "Fisio",
        evolution: "Evolução",
        idempotencyKey: `k-${suffix}`,
        ...sign,
      },
    });
    await saveProduction(prisma,adm.id,productionSchema.parse({id:randomUUID(),requestId:randomUUID(),expectedVersion:0,reason:"Preparação sintética para teste de limpeza",sessionId:session.id,coverageId:benefits.coverage.id,procedureId,quantity:1,endTime:"",authorizationItemId:"",operation:"PREPARAR"}));
    const guideSession=await prisma.treatmentSession.create({data:{patientId:patient.id,planId:plan.id,planRevisionId:plan.revisions[0].id,occurredAt:new Date("2026-01-15T12:00:00Z"),professionalId:fisio.id,professionalNameSnapshot:"Fisio",evolution:"SINTETICO",idempotencyKey:randomUUID(),...sign}});
    const guideProduction=randomUUID();await saveProduction(prisma,adm.id,productionSchema.parse({id:guideProduction,requestId:randomUUID(),expectedVersion:0,reason:"Conferência sintética para limpeza",sessionId:guideSession.id,coverageId:benefits.coverage.id,procedureId,quantity:1,endTime:"",authorizationItemId:benefits.item.id,operation:"CONFERIR"}));
    await saveGuideProfile(prisma,adm.id,{id:randomUUID(),requestId:randomUUID(),expectedVersion:0,reason:"Preservação de perfil",contractId,reference:"Perfil sintético de limpeza",rules:{...DEFAULT_GUIDE_RULES,characterCodes:["SINT"],attendanceCodes:["SINT"],regimeCodes:["SINT"],accidentCodes:["SINT"]}});
    const requester=await prisma.billingProfessional.findUniqueOrThrow({where:{userId:fisio.id}}),guideId=randomUUID();
    await saveGuide(prisma,adm.id,guideSchema.parse({id:guideId,requestId:randomUUID(),expectedVersion:0,reason:"Limpeza de guia sintética",operation:"CONFERIR",coverageId:benefits.coverage.id,authorizationId:benefits.authorization.id,month:"2026-01",requesterId:requester.id,requestedOn:"2026-01-01",characterCode:"SINT",attendanceCode:"SINT",regimeCode:"SINT",accidentCode:"SINT",productionIds:[guideProduction]}));
    const batch=batchSchema.parse({id:randomUUID(),requestId:randomUUID(),expectedVersion:0,reason:"Lote sintético de limpeza",operation:"SALVAR",contractId,tissVersion:"04.03.00",guideIds:[guideId]});
    await saveBatch(prisma,adm.id,batch);await saveBatch(prisma,adm.id,{...batch,operation:"FECHAR",expectedVersion:1,requestId:randomUUID()});
    const frozen=await prisma.billingBatch.findUniqueOrThrow({where:{id:batch.id}});
    const file=await prisma.$transaction(tx=>registerValidatedBatchArtifactTx(tx,adm.id,{purpose:'PRODUCAO',id:randomUUID(),batchId:batch.id,contentDigest:frozen.contentDigest,bytes:new TextEncoder().encode("SINTETICO SEM XSD"),validationReference:"Fixture de limpeza sem homologação",requestId:randomUUID()}));
    await saveBatch(prisma,adm.id,{...batch,operation:"ENVIAR",expectedVersion:2,requestId:randomUUID(),artifactId:file.id,sentOn:new Date(new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date())),protocol:"SINTETICO",channel:"MANUAL"});
    await saveSettlement(prisma,adm.id,settlementSchema.parse({id:randomUUID(),requestId:randomUUID(),contractId,kind:'RECEBER',effectiveOn:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()),reference:'DEMONSTRATIVO SINTETICO LIMPEZA',reason:'Histórico próprio incluído no inventário',amount:'0,01',lines:[{receivableId:guideProduction,amount:'0,01'}]}));
    await prisma.treatmentSessionChange.create({
      data: { sessionId: session.id, version: 2, field: "evolution", reason: "r", editorId: fisio.id, editorNameSnapshot: "Fisio" },
    });
    const reassessment = await prisma.reassessment.create({
      data: {
        patientId: patient.id,
        planId: plan.id,
        planRevisionId: plan.revisions[0].id,
        assessmentId: assessment.id,
        referenceSnapshot: { assessment: { id: assessment.id }, previous: null },
        reassessmentDate: new Date("2026-09-20"),
        progressSummary: "Melhora",
        goalsStatus: "PARCIALMENTE_ATINGIDOS",
        goalsJustification: "J",
        conclusion: "AJUSTE_PLANO",
        conclusionSummary: "S",
        ...sign,
      },
    });
    await prisma.reassessmentChange.create({
      data: { reassessmentId: reassessment.id, version: 2, field: "conclusion", reason: "r", editorId: fisio.id, editorNameSnapshot: "Fisio" },
    });
    // Revisão que aponta para a reavaliação, que aponta para a revisão 1: FKs cruzadas.
    await prisma.therapyPlanRevision.create({
      data: { planId: plan.id, number: 2, kind: "MUDANCA_CLINICA", reason: "Ajuste", planDate: new Date("2026-09-21"), goals: "G2", conduct: "C2", ...sign, reassessmentId: reassessment.id },
    });
  }

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
    prisma = openDb(url);
  });

  after(async () => {
    await prisma?.$disconnect();
    await raw?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin.end();
    }
  });

  beforeEach(async () => {
    await seed();
  });

  it("simulação (padrão) mostra o escopo e não altera nada", async () => {
    const before = await countAll();
    const result = await run([]);
    assert.equal(result.code, 0);
    assert.deepEqual(await countAll(), before);
    const text = result.out.join("\n");
    assert.match(text, /Modo: simulação/);
    for (const table of CLEARED_TABLES) assert.match(text, new RegExp(`\\b${table}\\b`));
    assert.match(text, /Auditoria: preservada/);
    // Saída sem credenciais: só host e nome do banco.
    assert.doesNotMatch(text, /fisio_ci_password|fisio_dev_password|@/);
  });

  it("confirmação errada ou ausente cancela sem alterar nada", async () => {
    const before = await countAll();
    assert.equal((await run(["--executar"], ["outro_banco", "LIMPAR"])).code, 1);
    assert.equal((await run(["--executar"], [dbName, "limpar"])).code, 1);
    assert.equal((await run(["--executar"], [])).code, 1);
    assert.deepEqual(await countAll(), before);
  });

  it("execução limpa todas as tabelas previstas, preserva usuários (todos os campos), configurações, migrações e auditoria", async () => {
    const users = await usersSnapshot();
    const administrative = await administrativeSnapshot();
    const before = await countAll();
    assert.ok(Object.values(before).every((n) => n > 0), "todas as tabelas começam com dados");

    const result = await run(["--executar"], [dbName, "LIMPAR"]);
    assert.equal(result.code, 0, result.err.join("\n"));

    const after = await countAll();
    for (const table of CLEARED_TABLES) assert.equal(after[table], 0, table);
    assert.equal(after.AuditLog, before.AuditLog);
    assert.equal(after.ClinicSettings, before.ClinicSettings);
    assert.equal(after._prisma_migrations, before._prisma_migrations);
    assert.deepEqual(await usersSnapshot(), users);
    assert.deepEqual(await administrativeSnapshot(), administrative);
    assert.match(result.out.join("\n"), /Usuários preservados: \d+/);

    // A imutabilidade da auditoria continua valendo.
    await assert.rejects(raw.query(`DELETE FROM "AuditLog"`), /menos de 7 dias/);
    await assert.rejects(raw.query(`TRUNCATE "AuditLog"`), /imutáveis/);
  });

  it("segunda execução seguida não perde usuários", async () => {
    await run(["--executar"], [dbName, "LIMPAR"]);
    const users = await usersSnapshot();
    const result = await run(["--executar"], [dbName, "LIMPAR"]);
    assert.equal(result.code, 0);
    assert.deepEqual(await usersSnapshot(), users);
  });

  it("--incluir-auditoria apaga os eventos anteriores e deixa as triggers ligadas", async () => {
    const users = await usersSnapshot();
    const result = await run(["--executar", "--incluir-auditoria"], [dbName, "LIMPAR"]);
    assert.equal(result.code, 0, result.err.join("\n"));
    assert.equal((await countAll()).AuditLog, 0);
    assert.deepEqual(await usersSnapshot(), users);
    const triggers = await raw.query(
      `SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = '"AuditLog"'::regclass AND NOT tgisinternal ORDER BY tgname`,
    );
    assert.deepEqual(
      triggers.rows.map((row) => `${row.tgname}:${row.tgenabled}`),
      ["AuditLog_immutable_row:O", "AuditLog_no_truncate:O"],
    );
    await raw.query(`INSERT INTO "AuditLog" ("id","action","result") VALUES ('novo-${Date.now()}','LOGIN','SUCESSO')`);
    await assert.rejects(raw.query(`DELETE FROM "AuditLog"`), /menos de 7 dias/);
  });

  it("falha intermediária desfaz tudo, inclusive a auditoria e a trigger", async () => {
    const before = await countAll();
    const users = await usersSnapshot();
    const result = await run(["--executar", "--incluir-auditoria"], [dbName, "LIMPAR"], {
      afterClear: async () => {
        throw new Error("falha simulada");
      },
    });
    assert.equal(result.code, 1);
    assert.match(result.err.join("\n"), /desfeita; nada foi alterado/);
    assert.deepEqual(await countAll(), before);
    assert.deepEqual(await usersSnapshot(), users);
    const enabled = await raw.query(
      `SELECT tgenabled FROM pg_trigger WHERE tgname = 'AuditLog_immutable_row' AND tgrelid = '"AuditLog"'::regclass`,
    );
    assert.equal(enabled.rows[0].tgenabled, "O");
  });

  it("alteração de usuário durante a operação é detectada e desfeita", async () => {
    const before = await countAll();
    const result = await run(["--executar"], [dbName, "LIMPAR"], {
      afterClear: async (tx) => {
        await tx.$executeRawUnsafe(`UPDATE "User" SET "name" = "name" || ' x' WHERE "role" = 'ADMIN'`);
      },
    });
    assert.equal(result.code, 1);
    assert.match(result.err.join("\n"), /usuários mudaram/);
    assert.deepEqual(await countAll(), before);
  });

  it("tabela ou dependência não prevista aborta antes de qualquer escrita", async () => {
    const before = await countAll();
    await raw.query(`CREATE TABLE "Extra" ("id" text PRIMARY KEY, "patientId" text REFERENCES "Patient"("id"))`);
    try {
      const result = await run(["--executar"], [dbName, "LIMPAR"]);
      assert.equal(result.code, 1);
      const text = result.err.join("\n");
      assert.match(text, /Tabelas não previstas: Extra/);
      assert.match(text, /Dependência não prevista: Extra → Patient/);
      assert.deepEqual(await countAll(), before);
    } finally {
      await raw.query(`DROP TABLE "Extra"`);
    }
  });

  it("URL ausente ou inválida aborta sem conectar", async () => {
    const console = io();
    const opened: string[] = [];
    const open = (value: string) => {
      opened.push(value);
      return openDb(value);
    };
    assert.equal(await runResetCli([], undefined, console.handle, open), 1);
    assert.equal(await runResetCli([], "não é url", console.handle, open), 1);
    assert.equal(await runResetCli(["--apagar-tudo"], url, console.handle, open), 1);
    assert.deepEqual(opened, []);
  });
});
