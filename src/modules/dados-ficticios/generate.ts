// Geração aditiva do conjunto fictício (issue #73) sobre um cliente Prisma qualquer, para o teste de
// integração exercitar exatamente esta transação. Autorização e habilitação do ambiente ficam na
// action; aqui ficam as regras de dados.
//
// - Nunca cria, altera ou remove User: usa os existentes. O executor (ADMIN ativo) é quem cadastra e
//   assina os registros (como faria pela interface); o profissional dos agendamentos e atendimentos é
//   um FISIOTERAPEUTA ativo com CREFITO, escolhido entre os elegíveis em ordem estável.
// - Uma transação só, sob lock consultivo próprio: duplo clique ou execuções concorrentes esperam e
//   depois encontram o conjunto já criado. Qualquer falha desfaz tudo (nada parcial).
// - Reexecução: conjunto completo não é recriado; conjunto incompleto é recusado com diagnóstico,
//   sem completar nem sobrescrever nada.
// - Respeita as regras da agenda (profissional apto, bloqueios, conflitos) e as constraints do banco;
//   nada é desligado. Conferências antes do COMMIT: contagens exatas e User idêntico.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { normalizeName } from "@/lib/names";
import { lockProfessionals } from "@/modules/agenda/service";
import {
  AgendaRuleError,
  assertNoConflict,
  assertNotBlocked,
  assertWithinBusinessHours,
  assertProfessionalAvailable,
  checkPatientConflict,
  PatientConflictWarning,
} from "@/modules/agenda/rules";
import { addDays, toInstant, toLocalDate } from "@/modules/agenda/validation";
import { writeAudit } from "@/modules/auditoria/write";
import type { ReferenceSnapshot } from "@/modules/clinico/reassessment-validation";
import {
  APPOINTMENT_MINUTES,
  CLINICAL_PREFIX,
  DATASET_ID,
  ENTITY_KEYS,
  ENTITY_LABELS,
  MARKER_PREFIX,
  PATIENTS,
  SLOT_HOURS,
  catalogProblems,
  expectedCounts,
  patientMarker,
  type EntityCounts,
  type PatientSpec,
} from "./catalog";

type Tx = Prisma.TransactionClient;

// Mensagem de negócio para a interface; nada foi gravado.
export class DevDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevDataError";
  }
}

export type Professional = { id: string; name: string; crefito: string };
export type DatasetStatus =
  | { state: "ausente" }
  | { state: "completo"; counts: EntityCounts }
  | { state: "incompleto"; detail: string };

export type DevDataResult = { created: boolean; counts: EntityCounts; reference: string };

// Ponto de teste: roda na transação depois das inserções e antes das conferências.
export type DevDataHooks = { afterCreate?: (tx: Tx) => Promise<void> };

const LOCK_KEY = "dados-ficticios";
export const NO_PROFESSIONAL =
  "Nenhum fisioterapeuta ativo com CREFITO cadastrado. Cadastre ou ative um em Usuários e tente de novo; nada foi gravado.";
export const NOT_ADMIN = "Apenas um Administrador ativo pode gerar dados fictícios.";

// Elegíveis para profissional: as mesmas condições da agenda (FISIOTERAPEUTA ativo) e CREFITO
// informado, que o cadastro atual exige do fisioterapeuta. Nada é preenchido automaticamente.
export async function eligibleProfessionals(db: Pick<Tx, "user">): Promise<Professional[]> {
  const rows = await db.user.findMany({
    where: { role: "FISIOTERAPEUTA", active: true, crefito: { not: null } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, crefito: true },
  });
  return rows.map((row) => ({ id: row.id, name: row.name, crefito: row.crefito! }));
}

// Distribuição estável: paciente i → profissional i mod n.
export function assignProfessionals(professionals: Professional[], patients: readonly PatientSpec[] = PATIENTS) {
  return new Map(patients.map((p, index) => [p.key, professionals[index % professionals.length]]));
}

async function datasetPatients(db: Pick<Tx, "patient">) {
  return db.patient.findMany({
    where: { notes: { startsWith: MARKER_PREFIX } },
    select: { id: true, notes: true },
  });
}

async function countsFor(db: Pick<Tx, "$queryRaw">, patientIds: string[]): Promise<EntityCounts> {
  const [row] = await db.$queryRaw<Record<keyof EntityCounts, number>[]>`
    SELECT
      (SELECT count(*)::int FROM "Patient" WHERE "id" = ANY(${patientIds}::text[])) AS "patients",
      (SELECT count(*)::int FROM "Appointment" WHERE "patientId" = ANY(${patientIds}::text[])) AS "appointments",
      (SELECT count(*)::int FROM "Anamnesis" WHERE "patientId" = ANY(${patientIds}::text[])) AS "anamneses",
      (SELECT count(*)::int FROM "Assessment" WHERE "patientId" = ANY(${patientIds}::text[])) AS "assessments",
      (SELECT count(*)::int FROM "TherapyPlan" WHERE "patientId" = ANY(${patientIds}::text[])) AS "therapyPlans",
      (SELECT count(*)::int FROM "TherapyPlanRevision" r JOIN "TherapyPlan" p ON p."id" = r."planId"
        WHERE p."patientId" = ANY(${patientIds}::text[])) AS "planRevisions",
      (SELECT count(*)::int FROM "TreatmentSession" WHERE "patientId" = ANY(${patientIds}::text[])) AS "treatmentSessions",
      (SELECT count(*)::int FROM "Reassessment" WHERE "patientId" = ANY(${patientIds}::text[])) AS "reassessments"`;
  return Object.fromEntries(ENTITY_KEYS.map((key) => [key, Number(row[key])])) as EntityCounts;
}

// Estado do conjunto no banco, reconhecido pelo marcador em Patient.notes.
export async function datasetStatus(db: Pick<Tx, "patient" | "$queryRaw">): Promise<DatasetStatus> {
  const rows = await datasetPatients(db);
  if (rows.length === 0) return { state: "ausente" };
  const found = new Map<string, number>();
  for (const row of rows) {
    const key = row.notes!.slice(MARKER_PREFIX.length).split("]")[0];
    found.set(key, (found.get(key) ?? 0) + 1);
  }
  const missing = PATIENTS.filter((p) => !found.has(p.key)).map((p) => p.key);
  const repeated = [...found].filter(([, n]) => n > 1).map(([key]) => key);
  const unknown = [...found.keys()].filter((key) => !PATIENTS.some((p) => p.key === key));
  if (missing.length || repeated.length || unknown.length) {
    const parts = [
      missing.length ? `faltam ${missing.join(", ")}` : "",
      repeated.length ? `repetidos ${repeated.join(", ")}` : "",
      unknown.length ? `não previstos ${unknown.join(", ")}` : "",
    ].filter(Boolean);
    return {
      state: "incompleto",
      detail: `O conjunto ${DATASET_ID} está incompleto ou foi alterado manualmente (${parts.join("; ")}). Nada será completado nem sobrescrito automaticamente.`,
    };
  }
  return { state: "completo", counts: await countsFor(db, rows.map((row) => row.id)) };
}

// Impressão digital de todas as linhas e colunas de User (inclui hashes): só comparada, nunca exibida.
async function userFingerprint(tx: Tx) {
  const [row] = await tx.$queryRaw<{ n: number; h: string }[]>`
    SELECT count(*)::int AS n, coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), '') AS h FROM "User" t`;
  return `${row.n}:${row.h}`;
}

const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
const clinical = (text: string) => `${CLINICAL_PREFIX} ${text}`;
const hh = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

// Primeiro horário livre do dia para o profissional, a partir da hora preferida (regras da agenda,
// inclusive o expediente quando ligado, #78). null = nenhum horário possível no dia.
async function findSlotOn(tx: Tx, professionalId: string, patientId: string, date: string, preferred: number) {
  const start = Math.max(0, SLOT_HOURS.indexOf(preferred as (typeof SLOT_HOURS)[number]));
  for (const hour of [...SLOT_HOURS.slice(start), ...SLOT_HOURS.slice(0, start)]) {
    const startsAt = toInstant(date, hh(hour));
    const slot = { professionalId, startsAt, endsAt: new Date(startsAt.getTime() + APPOINTMENT_MINUTES * 60_000) };
    try {
      await assertWithinBusinessHours(tx, slot);
      await assertNotBlocked(tx, slot);
      await assertNoConflict(tx, slot);
      await checkPatientConflict(tx, { ...slot, patientId });
      return slot;
    } catch (error) {
      if (error instanceof AgendaRuleError || error instanceof PatientConflictWarning) continue;
      throw error;
    }
  }
  return null;
}

// Dia preferido do catálogo e, se não houver horário (dia fechado, pausa, bloqueio, lotado), os dias
// seguintes na mesma direção: passado para trás, futuro para frente, até uma semana. `minDay` protege a
// cronologia (atendimento nunca antes do plano) e o passado nunca vira hoje ou futuro.
const DAY_SEARCH = 7;
async function findSlot(
  tx: Tx,
  input: { professionalId: string; patientId: string; reference: string; day: number; hour: number; minDay?: number },
) {
  const direction = input.day < 0 ? -1 : 1;
  for (let k = 0; k < DAY_SEARCH; k++) {
    const offset = input.day + direction * k;
    if (input.day < 0 && offset >= 0) break;
    if (input.minDay !== undefined && offset < input.minDay) break;
    const slot = await findSlotOn(tx, input.professionalId, input.patientId, addDays(input.reference, offset), input.hour);
    if (slot) return slot;
  }
  const [y, m, d] = addDays(input.reference, input.day).split("-");
  throw new DevDataError(
    `Não há horário possível na agenda do profissional perto de ${d}/${m}/${y} (expediente, bloqueios ou ocupação) para o conjunto fictício. Nada foi gravado.`,
  );
}

async function createPatient(
  tx: Tx,
  spec: PatientSpec,
  ctx: { reference: string; now: Date; actor: { id: string; name: string; crefito: string | null }; professional: Professional },
) {
  const { reference, now, actor, professional } = ctx;
  const date = (offset: number) => addDays(reference, offset);
  const author = { authorId: actor.id, authorNameSnapshot: actor.name, authorCrefitoSnapshot: actor.crefito };

  const patient = await tx.patient.create({
    data: {
      fullName: normalizeName(spec.fullName),
      birthDate: day(`${Number(reference.slice(0, 4)) - spec.age}-01-15`),
      sex: spec.sex,
      occupation: spec.occupation,
      phone: spec.phone,
      notes: `${patientMarker(spec.key)} Paciente fictício para testes e demonstração; não corresponde a pessoa real.`,
      createdById: actor.id,
      updatedById: actor.id,
    },
    select: { id: true },
  });

  const anamnesis = spec.anamnesis
    ? await tx.anamnesis.create({
        data: {
          patientId: patient.id,
          ...author,
          authorCrefitoRecorded: true,
          assessmentDate: day(date(spec.anamnesis.day)),
          chiefComplaint: clinical(spec.anamnesis.chiefComplaint),
          currentIllnessHistory: clinical(spec.anamnesis.currentIllnessHistory),
          painIntensity: spec.anamnesis.painIntensity,
          painLocation: spec.anamnesis.painLocation,
          patientGoals: clinical(spec.anamnesis.patientGoals),
        },
        select: { id: true },
      })
    : null;

  const assessment =
    spec.assessment && anamnesis
      ? await tx.assessment.create({
          data: {
            patientId: patient.id,
            anamnesisId: anamnesis.id,
            ...author,
            assessmentDate: day(date(spec.assessment.day)),
            diagnosis: clinical(spec.assessment.diagnosis),
            rangeOfMotion: clinical(spec.assessment.rangeOfMotion),
            muscleStrength: clinical(spec.assessment.muscleStrength),
            specialTests: clinical(spec.assessment.specialTests),
          },
          select: {
            id: true,
            version: true,
            assessmentDate: true,
            diagnosis: true,
            inspection: true,
            palpation: true,
            functionalGait: true,
            rangeOfMotion: true,
            muscleStrength: true,
            specialTests: true,
          },
        })
      : null;

  const plan =
    spec.plan && assessment
      ? await tx.therapyPlan.create({
          data: {
            patientId: patient.id,
            assessmentId: assessment.id,
            assessmentVersion: assessment.version,
            ...author,
            revisions: {
              create: {
                number: 1,
                kind: "INICIAL",
                planDate: day(date(spec.plan.day)),
                goals: clinical(spec.plan.goals),
                conduct: clinical(spec.plan.conduct),
                exercises: clinical(spec.plan.exercises),
                plannedSessions: spec.plan.plannedSessions,
                frequency: spec.plan.frequency,
                ...author,
              },
            },
          },
          select: { id: true, revisions: { select: { id: true } } },
        })
      : null;

  let sessionNumber = 0;
  for (const appointment of spec.appointments) {
    const slot = await findSlot(tx, {
      professionalId: professional.id,
      patientId: patient.id,
      reference,
      day: appointment.day,
      hour: appointment.hour,
      minDay: appointment.session ? spec.plan?.day : undefined,
    });
    await assertProfessionalAvailable(tx, professional.id);
    const created = await tx.appointment.create({
      data: {
        patientId: patient.id,
        ...slot,
        notes: `Agendamento do conjunto fictício ${DATASET_ID}.`,
        createdById: actor.id,
        updatedById: actor.id,
        ...(appointment.cancelled
          ? { status: "CANCELADO", cancelledAt: now, cancelReason: appointment.cancelled, cancelledById: actor.id }
          : {}),
        ...(appointment.attendance
          ? { attendance: appointment.attendance, attendanceMarkedAt: now, attendanceMarkedById: actor.id }
          : {}),
      },
      select: { id: true },
    });
    if (appointment.session && plan) {
      sessionNumber += 1;
      await tx.treatmentSession.create({
        data: {
          patientId: patient.id,
          planId: plan.id,
          planRevisionId: plan.revisions[0].id,
          appointmentId: created.id,
          occurredAt: slot.startsAt,
          professionalId: professional.id,
          professionalNameSnapshot: professional.name,
          professionalCrefitoSnapshot: professional.crefito,
          techniques: clinical(appointment.session.techniques),
          exercises: clinical(appointment.session.exercises),
          evolution: clinical(appointment.session.evolution),
          // Única no banco: uma segunda gravação do mesmo atendimento fictício falharia.
          idempotencyKey: `${DATASET_ID}:${spec.key}:${sessionNumber}`,
          ...author,
        },
        select: { id: true },
      });
    }
  }

  if (spec.reassessment && plan && assessment) {
    const snapshot: ReferenceSnapshot = {
      assessment: {
        id: assessment.id,
        version: assessment.version,
        assessmentDate: assessment.assessmentDate.toISOString().slice(0, 10),
        diagnosis: assessment.diagnosis,
        inspection: assessment.inspection,
        palpation: assessment.palpation,
        functionalGait: assessment.functionalGait,
        rangeOfMotion: assessment.rangeOfMotion,
        muscleStrength: assessment.muscleStrength,
        specialTests: assessment.specialTests,
      },
      previous: null,
    };
    await tx.reassessment.create({
      data: {
        patientId: patient.id,
        planId: plan.id,
        planRevisionId: plan.revisions[0].id,
        assessmentId: assessment.id,
        referenceSnapshot: snapshot,
        reassessmentDate: day(date(spec.reassessment.day)),
        progressSummary: clinical(spec.reassessment.progressSummary),
        goalsStatus: "PARCIALMENTE_ATINGIDOS",
        goalsJustification: clinical(spec.reassessment.goalsJustification),
        conclusion: "CONTINUIDADE",
        conclusionSummary: clinical(spec.reassessment.conclusionSummary),
        ...author,
      },
      select: { id: true },
    });
  }
  return patient.id;
}

export function countsSummary(counts: EntityCounts) {
  return ENTITY_KEYS.map((key) => `${ENTITY_LABELS[key].toLowerCase()} ${counts[key]}`).join(", ");
}

export async function generateDevData(
  db: Pick<PrismaClient, "$transaction">,
  input: { actorId: string; ip: string | null; expectedDatabase: string; now?: Date },
  hooks: DevDataHooks = {},
): Promise<DevDataResult> {
  const now = input.now ?? new Date();
  const reference = toLocalDate(now);
  const problems = catalogProblems();
  if (problems.length) throw new DevDataError(`Catálogo inconsistente: ${problems.join(" ")}`);

  return db.$transaction(
    async (tx) => {
      // Uma geração por vez (duplo clique, duas abas, duas pessoas): a segunda espera e relê o estado.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${LOCK_KEY}, 0))`;

      const [{ db: database }] = await tx.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
      if (database !== input.expectedDatabase) {
        throw new DevDataError("A conexão não aponta para o banco permitido. Nada foi gravado.");
      }

      // Sem escritas em User durante a operação; a impressão digital confirma no fim.
      await tx.$executeRaw`LOCK TABLE "User" IN SHARE MODE`;
      const usersBefore = await userFingerprint(tx);

      const actor = await tx.user.findUnique({
        where: { id: input.actorId },
        select: { id: true, name: true, crefito: true, role: true, active: true },
      });
      if (!actor || !actor.active || actor.role !== "ADMIN") throw new DevDataError(NOT_ADMIN);

      const professionals = await eligibleProfessionals(tx);
      if (professionals.length === 0) throw new DevDataError(NO_PROFESSIONAL);

      const status = await datasetStatus(tx);
      if (status.state === "completo") return { created: false, counts: status.counts, reference };
      if (status.state === "incompleto") throw new DevDataError(status.detail);

      const assignment = assignProfessionals(professionals);
      await lockProfessionals(tx, professionals.map((p) => p.id));
      const ids: string[] = [];
      for (const spec of PATIENTS) {
        ids.push(await createPatient(tx, spec, { reference, now, actor, professional: assignment.get(spec.key)! }));
      }

      await hooks.afterCreate?.(tx);

      const counts = await countsFor(tx, ids);
      const expected = expectedCounts();
      const wrong = ENTITY_KEYS.filter((key) => counts[key] !== expected[key]);
      if (wrong.length) throw new DevDataError(`Contagem divergente em ${wrong.join(", ")}. Nada foi gravado.`);
      if ((await userFingerprint(tx)) !== usersBefore) {
        throw new DevDataError("Os usuários mudaram durante a operação. Nada foi gravado.");
      }

      await writeAudit(tx, {
        action: "DADOS_FICTICIOS_GERADOS",
        result: "SUCESSO",
        actorId: actor.id,
        actorRole: actor.role,
        ip: input.ip,
        details: `Conjunto ${DATASET_ID}; referência ${reference}; criados: ${countsSummary(counts)}.`.slice(0, 500),
      });
      return { created: true, counts, reference };
    },
    { timeout: 60_000, maxWait: 30_000 },
  );
}
