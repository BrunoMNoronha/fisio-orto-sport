// Integração da geração de dados fictícios (issue #73) com PostgreSQL real. Cria um banco PRÓPRIO
// (CREATE DATABASE), aplica as migrações, semeia usuários e registros "preexistentes" e o descarta no
// fim, para não interferir nas outras suítes. Exige permissão CREATEDB (CI e Docker local têm).
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { addDays, toInstant, toLocalDate, toLocalTime } from "@/modules/agenda/validation";
import { CLINICAL_PREFIX, MARKER_PREFIX, expectedCounts } from "@/modules/dados-ficticios/catalog";
import { DevDataError, NOT_ADMIN, NO_PROFESSIONAL, generateDevData } from "@/modules/dados-ficticios/generate";
import { CLEARED_TABLES } from "@/modules/manutencao/reset-cli";

const baseUrl = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !baseUrl) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

describe("dados fictícios no PostgreSQL", { skip: !baseUrl && "INTEGRATION_DATABASE_URL não definida" }, () => {
  const dbName = `ficticios_it_${Date.now()}`;
  const now = new Date();
  const reference = toLocalDate(now);
  let url: string;
  let admin: Client;
  let raw: Client;
  let prisma: PrismaClient;
  const ids = {} as Record<"admin" | "adminInativo" | "recepcao" | "fisioSemCrefito" | "fisioInativo" | "ana" | "beto", string>;
  const pre = {} as Record<"patient" | "appointment" | "block", string>;

  const run = (actorId = ids.admin, extra: { expectedDatabase?: string; afterCreate?: () => Promise<void> } = {}) =>
    generateDevData(
      prisma,
      { actorId, ip: "127.0.0.1", expectedDatabase: extra.expectedDatabase ?? dbName, now },
      extra.afterCreate ? { afterCreate: extra.afterCreate } : {},
    );

  const TABLES = [...CLEARED_TABLES, "AuditLog", "User", "ClinicSettings"];
  async function countAll() {
    const result: Record<string, number> = {};
    for (const table of TABLES) result[table] = (await raw.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n;
    return result;
  }
  // Todas as linhas e colunas (inclusive hashes): só comparadas, nunca impressas.
  const rows = async (table: string) => (await raw.query(`SELECT * FROM "${table}" ORDER BY 1`)).rows;
  const preexisting = async () => ({
    users: await rows("User"),
    settings: await rows("ClinicSettings"),
    audit: await rows("AuditLog"),
    patient: (await raw.query(`SELECT * FROM "Patient" WHERE id = $1`, [pre.patient])).rows,
    appointment: (await raw.query(`SELECT * FROM "Appointment" WHERE id = $1`, [pre.appointment])).rows,
    block: (await raw.query(`SELECT * FROM "ScheduleBlock" WHERE id = $1`, [pre.block])).rows,
  });

  async function user(key: keyof typeof ids, name: string, role: "ADMIN" | "RECEPCAO" | "FISIOTERAPEUTA", extra = {}) {
    const created = await prisma.user.create({
      data: { name, email: `${key.toLowerCase()}@teste.local`, passwordHash: `hash-${key}`, role, ...extra },
      select: { id: true },
    });
    ids[key] = created.id;
  }

  async function rejects(promise: Promise<unknown>, message: RegExp | string) {
    await assert.rejects(promise, (error: unknown) => {
      assert.ok(error instanceof DevDataError, `esperava DevDataError, veio ${String(error)}`);
      if (typeof message === "string") assert.equal(error.message, message);
      else assert.match(error.message, message);
      return true;
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
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

    // Sem fisioterapeuta elegível ainda: sem CREFITO (legado) e inativo não contam.
    await user("admin", "Administradora Teste", "ADMIN");
    await user("adminInativo", "Admin Inativo", "ADMIN", { active: false });
    await user("recepcao", "Recepção Teste", "RECEPCAO");
    await user("fisioSemCrefito", "Aaron Sem Crefito", "FISIOTERAPEUTA");
    await user("fisioInativo", "Abel Inativo", "FISIOTERAPEUTA", { active: false, crefito: "999-F" });

    await prisma.clinicSettings.create({ data: { id: 1, displayName: "Clínica Real", updatedById: ids.admin } });
    await prisma.auditLog.create({ data: { action: "LOGIN", result: "SUCESSO", actorId: ids.admin, actorRole: "ADMIN" } });
  });

  after(async () => {
    await prisma?.$disconnect();
    await raw?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin.end();
    }
  });

  it("sem fisioterapeuta elegível, recusa sem gravar e sem criar conta", async () => {
    const before = await countAll();
    const users = await rows("User");
    await rejects(run(), NO_PROFESSIONAL);
    assert.deepEqual(await countAll(), before);
    assert.deepEqual(await rows("User"), users);
  });

  it("executor que não é Administrador ativo, ou banco diferente do permitido, não grava", async () => {
    const before = await countAll();
    await rejects(run(ids.recepcao), NOT_ADMIN);
    await rejects(run(ids.adminInativo), NOT_ADMIN);
    await rejects(run(ids.ana ?? "inexistente"), NOT_ADMIN);
    await rejects(run(ids.admin, { expectedDatabase: "fisio_orto_sport" }), /banco permitido/);
    assert.deepEqual(await countAll(), before);
  });

  it("falha intermediária desfaz tudo (nada parcial)", async () => {
    await user("ana", "Ana Fisio", "FISIOTERAPEUTA", { crefito: "111-F" });
    await user("beto", "Beto Fisio", "FISIOTERAPEUTA", { crefito: "222-F" });

    // Registros reais preexistentes que ocupam horários preferidos do conjunto.
    const patient = await prisma.patient.create({
      data: { fullName: "Paciente Real", birthDate: new Date("1980-05-05"), phone: "11988887777", createdById: ids.recepcao, updatedById: ids.recepcao },
      select: { id: true },
    });
    pre.patient = patient.id;
    const p1Future = toInstant(addDays(reference, 3), "09:00");
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        professionalId: ids.ana,
        startsAt: p1Future,
        endsAt: new Date(p1Future.getTime() + 60 * 60_000),
        createdById: ids.recepcao,
        updatedById: ids.recepcao,
      },
      select: { id: true },
    });
    pre.appointment = appointment.id;
    const block = await prisma.scheduleBlock.create({
      data: {
        professionalId: ids.beto,
        startsAt: toInstant(addDays(reference, 2), "09:30"),
        endsAt: toInstant(addDays(reference, 2), "10:30"),
        reason: "Ausência",
        createdById: ids.admin,
      },
      select: { id: true },
    });
    pre.block = block.id;

    const before = await countAll();
    const snapshot = await preexisting();
    await assert.rejects(
      run(ids.admin, {
        afterCreate: async () => {
          throw new Error("falha simulada");
        },
      }),
      /falha simulada/,
    );
    assert.deepEqual(await countAll(), before);
    assert.deepEqual(await preexisting(), snapshot);
  });

  it("gera o conjunto uma única vez mesmo com execuções concorrentes (duplo clique)", async () => {
    const before = await countAll();
    const snapshot = await preexisting();
    const results = await Promise.all([run(), run(), run()]);

    const expected = expectedCounts();
    assert.equal(results.filter((r) => r.created).length, 1);
    for (const result of results) {
      assert.deepEqual(result.counts, expected);
      assert.equal(result.reference, reference);
    }

    const afterCounts = await countAll();
    assert.equal(afterCounts.Patient - before.Patient, expected.patients);
    assert.equal(afterCounts.Appointment - before.Appointment, expected.appointments);
    assert.equal(afterCounts.Anamnesis - before.Anamnesis, expected.anamneses);
    assert.equal(afterCounts.Assessment - before.Assessment, expected.assessments);
    assert.equal(afterCounts.TherapyPlan - before.TherapyPlan, expected.therapyPlans);
    assert.equal(afterCounts.TherapyPlanRevision - before.TherapyPlanRevision, expected.planRevisions);
    assert.equal(afterCounts.TreatmentSession - before.TreatmentSession, expected.treatmentSessions);
    assert.equal(afterCounts.Reassessment - before.Reassessment, expected.reassessments);
    for (const table of ["AssessmentChange", "TherapyPlanStatusChange", "TreatmentSessionChange", "ReassessmentChange", "Session", "AuthRateLimit", "ScheduleBlock"]) {
      assert.equal(afterCounts[table], before[table], table);
    }
    assert.equal(afterCounts.AuditLog, before.AuditLog + 1);

    // Nenhum usuário criado, removido ou alterado; registros e configurações preexistentes intactos.
    const now2 = await preexisting();
    assert.deepEqual(now2.users, snapshot.users);
    assert.deepEqual(now2.settings, snapshot.settings);
    assert.deepEqual(now2.patient, snapshot.patient);
    assert.deepEqual(now2.appointment, snapshot.appointment);
    assert.deepEqual(now2.block, snapshot.block);
    const previousAuditIds = new Set(snapshot.audit.map((row) => row.id));
    assert.deepEqual(now2.audit.filter((row) => previousAuditIds.has(row.id)), snapshot.audit);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "DADOS_FICTICIOS_GERADOS" } });
    assert.equal(audit.actorId, ids.admin);
    assert.equal(audit.actorRole, "ADMIN");
    assert.equal(audit.result, "SUCESSO");
    assert.match(audit.details ?? "", new RegExp(`^Conjunto demo-v1; referência ${reference}; criados: pacientes 4, agendamentos 10`));
    assert.doesNotMatch(audit.details ?? "", /Fictíci|joelho|hash/i);
  });

  it("relações, autoria, cronologia e agenda respeitam as regras", async () => {
    const patients = await prisma.patient.findMany({ where: { notes: { startsWith: MARKER_PREFIX } }, orderBy: { fullName: "asc" } });
    assert.equal(patients.length, 4);
    for (const p of patients) {
      assert.match(p.fullName, /Fictíci[oa] Demonstração/);
      assert.equal(p.cpf, null);
      assert.equal(p.email, null);
      assert.equal(p.address, null);
      assert.equal(p.status, "ATIVO");
      assert.equal(p.createdById, ids.admin);
      assert.ok(p.searchName.includes("demonstracao"), "trigger de busca aplicado");
    }
    const ptIds = patients.map((p) => p.id);

    const appointments = await prisma.appointment.findMany({ where: { patientId: { in: ptIds } }, include: { sessions: true } });
    for (const a of appointments) {
      assert.ok([ids.ana, ids.beto].includes(a.professionalId), "só fisioterapeutas elegíveis");
      assert.equal(a.createdById, ids.admin);
      if (a.attendance) {
        assert.ok(a.startsAt < now, "presença só depois do início");
        assert.equal(a.attendanceMarkedById, ids.admin);
      }
      for (const s of a.sessions) {
        assert.equal(a.attendance, "COMPARECEU");
        assert.equal(s.professionalId, a.professionalId);
        assert.equal(s.occurredAt.getTime(), a.startsAt.getTime());
        assert.ok(s.occurredAt < now);
        assert.ok(s.evolution.startsWith(CLINICAL_PREFIX));
        assert.equal(s.authorId, ids.admin);
        assert.equal(s.authorCrefitoSnapshot, null);
        assert.ok(["Ana Fisio", "Beto Fisio"].includes(s.professionalNameSnapshot));
        assert.ok(["111-F", "222-F"].includes(s.professionalCrefitoSnapshot ?? ""));
      }
    }
    assert.equal(appointments.filter((a) => a.status === "CANCELADO").length, 1);

    // Conflitos: o horário preferido de Ana (hoje+3 09:00) estava ocupado e o de Beto (hoje+2 10:00)
    // bloqueado; os agendamentos foram para o próximo horário livre.
    const on = (date: string, pro: string) =>
      appointments.filter((a) => a.professionalId === pro && toLocalDate(a.startsAt) === date && a.status === "AGENDADO");
    assert.deepEqual(on(addDays(reference, 3), ids.ana).map((a) => toLocalTime(a.startsAt)), ["10:00"]);
    assert.deepEqual(on(addDays(reference, 2), ids.beto).map((a) => toLocalTime(a.startsAt)), ["11:00"]);
    const overlap = await raw.query(
      `SELECT count(*)::int AS n FROM "Appointment" a JOIN "Appointment" b ON a.id < b.id
        AND a."professionalId" = b."professionalId" AND a.status = 'AGENDADO' AND b.status = 'AGENDADO'
        AND a."startsAt" < b."endsAt" AND b."startsAt" < a."endsAt"`,
    );
    assert.equal(overlap.rows[0].n, 0);

    const anamneses = await prisma.anamnesis.findMany({ where: { patientId: { in: ptIds } } });
    for (const an of anamneses) {
      assert.equal(an.authorId, ids.admin);
      assert.equal(an.authorNameSnapshot, "Administradora Teste");
      assert.equal(an.authorCrefitoRecorded, true);
      assert.ok(an.chiefComplaint.startsWith(CLINICAL_PREFIX));
      assert.ok(an.assessmentDate.toISOString().slice(0, 10) <= reference);
    }
    const plans = await prisma.therapyPlan.findMany({
      where: { patientId: { in: ptIds } },
      include: { revisions: true, assessment: true, reassessments: true },
    });
    for (const plan of plans) {
      assert.equal(plan.status, "ATIVO");
      assert.equal(plan.revisions.length, 1);
      assert.equal(plan.revisions[0].kind, "INICIAL");
      assert.ok(plan.revisions[0].planDate >= plan.assessment.assessmentDate);
      for (const r of plan.reassessments) {
        assert.ok(r.reassessmentDate >= plan.revisions[0].planDate);
        assert.equal(r.planRevisionId, plan.revisions[0].id);
        assert.equal((r.referenceSnapshot as { assessment: { id: string } }).assessment.id, plan.assessmentId);
      }
    }
  });

  it("reexecução não duplica nem grava nada", async () => {
    const before = await countAll();
    const users = await rows("User");
    const result = await run();
    assert.equal(result.created, false);
    assert.deepEqual(result.counts, expectedCounts());
    assert.deepEqual(await countAll(), before);
    assert.deepEqual(await rows("User"), users);
  });

  it("conjunto alterado manualmente é recusado com diagnóstico, sem completar nem sobrescrever", async () => {
    const target = await prisma.patient.findFirstOrThrow({ where: { notes: { startsWith: `${MARKER_PREFIX}P3]` } } });
    await raw.query(`UPDATE "Patient" SET notes = 'Editado manualmente' WHERE id = $1`, [target.id]);
    const before = await countAll();
    await rejects(run(), /incompleto ou foi alterado manualmente \(faltam P3\)/);
    assert.deepEqual(await countAll(), before);
    const edited = await prisma.patient.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(edited.notes, "Editado manualmente");
  });
});
