import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { insertAppointment, moveAppointment, cancelAppointmentRecord, ruleFailure } from '@/modules/agenda/service';
import { isOverlapViolation } from '@/modules/agenda/rules';

const url = process.env.INTEGRATION_DATABASE_URL;
if (process.env.CI && !url) throw new Error('INTEGRATION_DATABASE_URL obrigatória');
describe('capacidade simultânea PostgreSQL (#82)', { skip: !url }, () => {
  const clients: PrismaClient[] = [];
  let db: PrismaClient;
  let actor: string;
  let professional: string;
  let otherProfessional: string;
  let patients: string[];
  let day = 0;
  const client = () => {
    const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    clients.push(c); return c;
  };
  const at = (d: number, hour: number) => new Date(Date.UTC(2097, 0, d, hour));
  const booking = (d: number, patient = 0, start = 9, end = 10, prof = professional) => ({
    patientId: patients[patient], professionalId: prof, startsAt: at(d, start), endsAt: at(d, end), notes: null,
  });
  const raw = (data: ReturnType<typeof booking>) => ({ ...data, createdById: actor, updatedById: actor });
  const limit = (value: number) => db.clinicSettings.upsert({ where: { id: 1 },
    create: { id: 1, updatedById: actor, maxSimultaneousAppointments: value },
    update: { maxSimultaneousAppointments: value } });
  before(async () => {
    db = client();
    await db.clinicSettings.deleteMany({});
    const suffix = `${Date.now()}-capacity`;
    actor = (await db.user.create({ data: { name: 'ADMIN CAPACIDADE', email: `${suffix}@test.local`, passwordHash: 'x', role: 'ADMIN' } })).id;
    professional = (await db.user.create({ data: { name: 'FISIO CAPACIDADE', email: `a-${suffix}@test.local`, passwordHash: 'x', role: 'FISIOTERAPEUTA' } })).id;
    otherProfessional = (await db.user.create({ data: { name: 'FISIO OUTRO', email: `b-${suffix}@test.local`, passwordHash: 'x', role: 'FISIOTERAPEUTA' } })).id;
    patients = [];
    for (let i = 0; i < 8; i++) patients.push((await db.patient.create({ data: {
      fullName: `PACIENTE CAPACIDADE ${i}`, birthDate: new Date('1990-01-01'), phone: '11999999999', createdById: actor, updatedById: actor,
    } })).id);
  });
  after(async () => {
    await db?.clinicSettings.deleteMany({});
    await Promise.all(clients.map(c => c.$disconnect()));
  });
  it('sem configuração aceita três pacientes distintos e bloqueia quarto; profissional independente', async () => {
    const d = ++day;
    for (let i = 0; i < 3; i++) await insertAppointment(db, booking(d, i), actor);
    await assert.rejects(insertAppointment(db, booking(d, 3), actor), error => !!ruleFailure(error));
    await insertAppointment(db, booking(d, 3, 9, 10, otherProfessional), actor);
    assert.equal(await db.appointment.count({ where: { professionalId: professional, startsAt: at(d, 9) } }), 3);
  });
  it('pico real com X=2: dois registros adjacentes mais candidato longo são aceitos', async () => {
    await limit(2); const d = ++day;
    await db.appointment.create({ data: raw(booking(d, 0, 9, 10)) });
    await db.appointment.create({ data: raw(booking(d, 1, 10, 11)) });
    await insertAppointment(db, booking(d, 2, 9, 11), actor);
    await assert.rejects(db.appointment.create({ data: raw(booking(d, 3, 9, 10)) }), isOverlapViolation);
  });
  it('SQL direto simultâneo nunca excede X=3, inclusive após aguardar commit', async () => {
    await limit(3); const d = ++day;
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => client().appointment.create({ data: raw(booking(d, i)) })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
    for (const r of results) if (r.status === 'rejected') assert.ok(isOverlapViolation(r.reason));
  });
  it('serviços concorrentes permitem só três e reaproveitam vaga cancelada', async () => {
    const d = ++day;
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => insertAppointment(client(), booking(d, i), actor)));
    const winners = results.filter(r => r.status === 'fulfilled');
    assert.equal(winners.length, 3);
    for (const r of results) if (r.status === 'rejected') assert.ok(ruleFailure(r.reason));
    assert.equal(await cancelAppointmentRecord(db, (winners[0] as PromiseFulfilledResult<string>).value, null, actor), null);
    await insertAppointment(db, booking(d, 7), actor, { allowPatientConflict: true });
  });
  it('reagendamentos concorrentes deixam só três no destino e preservam as origens recusadas', async () => {
    await limit(3); const d = ++day;
    const sources = [];
    for (let i = 0; i < 8; i++) sources.push(await insertAppointment(db, booking(d, i, 11 + i, 12 + i), actor));
    const results = await Promise.allSettled(sources.map((id, i) => moveAppointment(client(), id, booking(d, i), actor)));
    assert.equal(results.filter(r => r.status === 'fulfilled' && r.value === null).length, 3);
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        assert.ok(ruleFailure(result.reason));
        assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: sources[i] } })).startsAt.getTime(), at(d, 11 + i).getTime());
      }
    }
    assert.equal(await db.appointment.count({ where: { professionalId: professional, startsAt: at(d, 9) } }), 3);
  });
  it('redução preserva excesso e metadados; reagendar recusa destino cheio sem alterar origem', async () => {
    const d = ++day;
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push(await insertAppointment(db, booking(d, i), actor));
    await limit(1);
    assert.equal(await db.appointment.count({ where: { id: { in: ids } } }), 3);
    await db.appointment.update({ where: { id: ids[0] }, data: { notes: 'PRESERVADO' } });
    const from = await insertAppointment(db, booking(d, 4, 11, 12), actor);
    await assert.rejects(moveAppointment(db, from, booking(d, 4), actor), error => !!ruleFailure(error));
    assert.equal((await db.appointment.findUniqueOrThrow({ where: { id: from } })).startsAt.getTime(), at(d, 11).getTime());
    assert.equal(await cancelAppointmentRecord(db, ids[0], null, actor), null);
  });
  it('alteração de configuração espera escrita em curso; nova escrita usa limite confirmado', async () => {
    await limit(3); const d = ++day;
    const connection = new Client({ connectionString: url }); await connection.connect();
    try {
      await connection.query('BEGIN');
      await connection.query(`INSERT INTO "Appointment" (id, "patientId", "professionalId", "startsAt", "endsAt", "createdById", "updatedById", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$6,now())`,
        [`capacity-${Date.now()}`, patients[0], professional, at(d, 9), at(d, 10), actor]);
      let finished = false;
      const saving = limit(1).then(() => { finished = true; });
      // A sessão administrativa deve ficar bloqueada no lock exclusivo da capacidade.
      let waiting = false;
      for (let i = 0; i < 100; i++) {
        const result = await connection.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))) AS waiting`, [(await connection.query('SELECT pg_backend_pid() AS pid')).rows[0].pid]);
        if (result.rows[0].waiting) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(waiting); assert.equal(finished, false);
      await connection.query('COMMIT'); await saving;
      await assert.rejects(insertAppointment(db, booking(d, 1), actor), error => !!ruleFailure(error));
    } finally { await connection.query('ROLLBACK'); await connection.end(); }
  });
  it('não aceita snapshot fixo e limite inválido no banco', async () => {
    const d = ++day;
    await assert.rejects(db.$transaction(tx => tx.appointment.create({ data: raw(booking(d)) }), { isolationLevel: 'RepeatableRead' }));
    await assert.rejects(limit(0));
  });
});
