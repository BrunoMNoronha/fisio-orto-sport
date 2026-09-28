// Integração do expediente da clínica (issue #78) com PostgreSQL real. Mexe na linha única de
// ClinicSettings, que a suíte de configurações usa em paralelo: por isso cria um banco PRÓPRIO e o
// descarta no fim. Usa as mesmas transações da agenda (insertAppointment/moveAppointment) e o gerador de
// dados fictícios.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { isWithinBusinessHours, parseBusinessHours } from "@/modules/agenda/business-hours";
import { insertAppointment, moveAppointment, ruleFailure } from "@/modules/agenda/service";
import { toInstant, toLocalDate } from "@/modules/agenda/validation";
import { generateDevData } from "@/modules/dados-ficticios/generate";

const baseUrl = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !baseUrl) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");

// Seg–Sex 08:00–12:00 e 13:00–18:00; sábado e domingo fechados.
const HOURS = ";08:00-12:00,13:00-18:00;08:00-12:00,13:00-18:00;08:00-12:00,13:00-18:00;08:00-12:00,13:00-18:00;08:00-12:00,13:00-18:00;";
// 2099-01-12 é segunda-feira; 2099-01-11, domingo.
const MONDAY = "2099-01-12";
const SUNDAY = "2099-01-11";

describe("expediente no PostgreSQL", { skip: !baseUrl && "INTEGRATION_DATABASE_URL não definida" }, () => {
  const dbName = `expediente_it_${Date.now()}`;
  let admin: Client;
  let prisma: PrismaClient;
  const ids = {} as Record<"admin" | "fisio" | "patient", string>;

  const slot = (date: string, start: string, end: string) => ({
    professionalId: ids.fisio,
    startsAt: toInstant(date, start),
    endsAt: toInstant(date, end),
  });
  const create = (date: string, start: string, end: string) =>
    insertAppointment(prisma, { patientId: ids.patient, notes: null, ...slot(date, start, end) }, ids.admin);
  const failureOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return null;
    } catch (error) {
      return ruleFailure(error);
    }
  };
  const setHours = (enabled: boolean, text = HOURS) =>
    prisma.clinicSettings.upsert({
      where: { id: 1 },
      create: { id: 1, businessHoursEnabled: enabled, businessHours: text, updatedById: ids.admin },
      update: { businessHoursEnabled: enabled, businessHours: text },
    });

  before(async () => {
    admin = new Client({ connectionString: baseUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${dbName}"`);
    const target = new URL(baseUrl!);
    target.pathname = `/${dbName}`;
    execSync("pnpm exec prisma migrate deploy", { env: { ...process.env, DATABASE_URL: target.toString() }, stdio: "pipe" });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.toString() }) });
    ids.admin = (await prisma.user.create({ data: { name: "ADMIN", email: "admin@exp.test", passwordHash: "x", role: "ADMIN" } })).id;
    ids.fisio = (
      await prisma.user.create({ data: { name: "FISIO", email: "fisio@exp.test", passwordHash: "x", role: "FISIOTERAPEUTA", crefito: "1-F" } })
    ).id;
    ids.patient = (
      await prisma.patient.create({
        data: { fullName: "PACIENTE", birthDate: new Date("1990-01-01"), phone: "11999999999", createdById: ids.admin, updatedById: ids.admin },
      })
    ).id;
  });

  after(async () => {
    await prisma?.$disconnect();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin.end();
    }
  });

  it("sem configuração ou com a chave desligada, não restringe (padrão)", async () => {
    await create(SUNDAY, "20:00", "21:00");
    await setHours(false);
    await create(SUNDAY, "21:00", "22:00");
  });

  it("CHECK do banco recusa texto fora da forma geral", async () => {
    await assert.rejects(setHours(false, "qualquer coisa"), /business_hours_format|23514/);
  });

  it("com expediente ligado: aceita dentro; recusa dia fechado, pausa, abertura e fechamento", async () => {
    await setHours(true);
    await create(MONDAY, "08:00", "09:00");
    await create(MONDAY, "17:00", "18:00");
    for (const [date, start, end] of [
      [SUNDAY, "09:00", "10:00"],
      [MONDAY, "11:30", "12:30"],
      [MONDAY, "12:00", "12:50"],
      [MONDAY, "07:30", "08:30"],
      [MONDAY, "17:30", "18:30"],
    ]) {
      const failure = await failureOf(create(date, start, end));
      assert.match(failure?.fieldErrors?.startTime?.[0] ?? "", /^Fora do expediente/, `${date} ${start}`);
    }
    assert.equal(await prisma.appointment.count({ where: { startsAt: { gte: toInstant(MONDAY, "00:00") } } }), 2);
  });

  it("agendamentos antigos fora do expediente ficam intactos; reagendar exige horário válido", async () => {
    const old = await prisma.appointment.findFirstOrThrow({ where: { startsAt: toInstant(SUNDAY, "20:00") } });
    const before = await prisma.appointment.findUniqueOrThrow({ where: { id: old.id } });
    // Mudar o expediente não cancela nem desloca nada.
    await setHours(true, HOURS);
    assert.deepEqual(await prisma.appointment.findUniqueOrThrow({ where: { id: old.id } }), before);

    const refused = await moveAppointment(prisma, old.id, slot(SUNDAY, "10:00", "11:00"), ids.admin).catch(ruleFailure);
    assert.match(refused?.fieldErrors?.startTime?.[0] ?? "", /^Fora do expediente/);
    assert.deepEqual(await prisma.appointment.findUniqueOrThrow({ where: { id: old.id } }), before);
    assert.equal(await moveAppointment(prisma, old.id, slot(MONDAY, "09:00", "10:00"), ids.admin), null);
  });

  it("gerador de dados fictícios só usa horários dentro do expediente", async () => {
    const result = await generateDevData(prisma, { actorId: ids.admin, ip: null, expectedDatabase: dbName });
    assert.equal(result.created, true);
    const week = parseBusinessHours(HOURS)!;
    const generated = await prisma.appointment.findMany({
      where: { patient: { notes: { startsWith: "[conjunto-ficticio:" } } },
      select: { startsAt: true, endsAt: true, sessions: { select: { occurredAt: true } } },
    });
    assert.equal(generated.length, 10);
    for (const item of generated) {
      assert.ok(isWithinBusinessHours(week, item.startsAt, item.endsAt), toLocalDate(item.startsAt));
      for (const session of item.sessions) assert.ok(session.occurredAt < new Date());
    }
    // Referência de sanidade: nenhum agendamento gerado cai em fim de semana.
    const weekend = generated.filter((item) => [0, 6].includes(new Date(`${toLocalDate(item.startsAt)}T12:00:00Z`).getUTCDay()));
    assert.equal(weekend.length, 0);
  });
});
