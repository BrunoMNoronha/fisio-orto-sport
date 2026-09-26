// Integração com PostgreSQL real da reavaliação (migração reavaliacao): FKs compostas (plano, revisão,
// avaliação e reavaliação anterior do mesmo paciente/plano), revisão do plano motivada por reavaliação
// (única, mudança clínica, mesmo plano), comparação congelada e o fluxo avaliação → plano → sessão →
// reavaliação → revisão → nova sessão, com a sessão antiga presa à revisão original.
// Roda só com INTEGRATION_DATABASE_URL apontando para um banco DESCARTÁVEL já migrado.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

const url = process.env.INTEGRATION_DATABASE_URL;
describe("reavaliação no PostgreSQL", { skip: !url && "INTEGRATION_DATABASE_URL não definida" }, () => {
  let prisma: PrismaClient;
  let userId: string;
  const suffix = Date.now();
  let seq = 0;

  before(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const user = await prisma.user.create({
      data: { name: "Fisio Reav", email: `fisio-re-${suffix}@teste.local`, passwordHash: "x", role: "FISIOTERAPEUTA" },
    });
    userId = user.id;
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  const sign = () => ({ authorId: userId, authorNameSnapshot: "Fisio Reav" });

  async function newPlan() {
    const patient = await prisma.patient.create({
      data: { fullName: "Paciente Reav", birthDate: new Date("1990-01-01"), phone: "11999999999", createdById: userId, updatedById: userId },
      select: { id: true },
    });
    const anamnesis = await prisma.anamnesis.create({
      data: { patientId: patient.id, ...sign(), assessmentDate: new Date("2026-09-01"), chiefComplaint: "Dor" },
    });
    const assessment = await prisma.assessment.create({
      data: { patientId: patient.id, anamnesisId: anamnesis.id, ...sign(), assessmentDate: new Date("2026-09-01"), diagnosis: "Dx", rangeOfMotion: "90" },
    });
    const plan = await prisma.therapyPlan.create({
      data: {
        patientId: patient.id,
        assessmentId: assessment.id,
        assessmentVersion: 1,
        ...sign(),
        revisions: { create: { number: 1, kind: "INICIAL", planDate: new Date("2026-09-02"), goals: "G1", conduct: "C1", ...sign() } },
      },
      select: { id: true, revisions: { select: { id: true } } },
    });
    return { patientId: patient.id, assessmentId: assessment.id, planId: plan.id, revisionId: plan.revisions[0].id };
  }

  type Ids = Awaited<ReturnType<typeof newPlan>>;
  const reassessmentData = (ids: Ids, extra: Partial<Prisma.ReassessmentUncheckedCreateInput> = {}) => ({
    patientId: ids.patientId,
    planId: ids.planId,
    planRevisionId: ids.revisionId,
    assessmentId: ids.assessmentId,
    referenceSnapshot: { assessment: { id: ids.assessmentId, rangeOfMotion: "90" }, previous: null },
    reassessmentDate: new Date("2026-09-20"),
    progressSummary: "Melhora",
    goalsStatus: "PARCIALMENTE_ATINGIDOS" as const,
    goalsJustification: "J",
    conclusion: "AJUSTE_PLANO" as const,
    conclusionSummary: "S",
    ...sign(),
    ...extra,
  });

  const p2003 = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003";

  it("FKs compostas: plano, revisão, avaliação e reavaliação anterior precisam ser do mesmo paciente/plano", async () => {
    const a = await newPlan();
    const b = await newPlan();
    await assert.rejects(prisma.reassessment.create({ data: reassessmentData({ ...a, planId: b.planId, revisionId: b.revisionId }) }), p2003);
    await assert.rejects(prisma.reassessment.create({ data: reassessmentData({ ...a, revisionId: b.revisionId }) }), p2003);
    await assert.rejects(prisma.reassessment.create({ data: reassessmentData({ ...a, assessmentId: b.assessmentId }) }), p2003);
    const otherPrevious = await prisma.reassessment.create({ data: reassessmentData(b) });
    await assert.rejects(prisma.reassessment.create({ data: reassessmentData(a, { previousReassessmentId: otherPrevious.id }) }), p2003);
    assert.equal(await prisma.reassessment.count({ where: { patientId: a.patientId } }), 0);
  });

  it("CHECKs: textos obrigatórios não vazios e versão positiva", async () => {
    const ids = await newPlan();
    await assert.rejects(prisma.reassessment.create({ data: reassessmentData(ids, { progressSummary: " " }) }));
    await assert.rejects(prisma.reassessment.create({ data: reassessmentData(ids, { conclusionSummary: "" }) }));
    await assert.rejects(prisma.reassessment.create({ data: reassessmentData(ids, { version: 0 }) }));
  });

  it("revisão motivada: mesma reavaliação só origina uma revisão, do mesmo plano e como mudança clínica", async () => {
    const a = await newPlan();
    const b = await newPlan();
    const re = await prisma.reassessment.create({ data: reassessmentData(a) });
    const revision = (planId: string, number: number, extra: Partial<Prisma.TherapyPlanRevisionUncheckedCreateInput> = {}) =>
      prisma.therapyPlanRevision.create({
        data: { planId, number, kind: "MUDANCA_CLINICA", reason: "Ajuste", planDate: new Date("2026-09-21"), goals: "G2", conduct: "C2", ...sign(), reassessmentId: re.id, ...extra },
      });
    // Reavaliação de outro plano.
    await assert.rejects(revision(b.planId, 2), p2003);
    // Não pode ser correção nem revisão 1.
    await assert.rejects(revision(a.planId, 2, { kind: "CORRECAO" }));
    await revision(a.planId, 2);
    // Segunda revisão da mesma reavaliação é barrada pela unicidade.
    await assert.rejects(revision(a.planId, 3), (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002");
    // A reavaliação usada não pode ser apagada.
    await assert.rejects(prisma.reassessment.delete({ where: { id: re.id } }));
  });

  it("fluxo: sessão → reavaliação → revisão ligada → nova sessão na nova revisão; a antiga continua na original", async () => {
    const ids = await newPlan();
    const key = () => `re-${suffix}-${++seq}`;
    const oldSession = await prisma.treatmentSession.create({
      data: {
        patientId: ids.patientId,
        planId: ids.planId,
        planRevisionId: ids.revisionId,
        occurredAt: new Date("2026-09-10T12:00:00Z"),
        professionalId: userId,
        professionalNameSnapshot: "Fisio Reav",
        evolution: "E1",
        idempotencyKey: key(),
        ...sign(),
      },
    });
    const re = await prisma.reassessment.create({ data: reassessmentData(ids) });
    const [newRevision] = await prisma.$transaction([
      prisma.therapyPlanRevision.create({
        data: { planId: ids.planId, number: 2, kind: "MUDANCA_CLINICA", reason: "Ajuste", planDate: new Date("2026-09-21"), goals: "G2", conduct: "C2", ...sign(), reassessmentId: re.id },
      }),
      prisma.therapyPlan.update({ where: { id: ids.planId }, data: { currentRevision: 2 } }),
    ]);
    const newSession = await prisma.treatmentSession.create({
      data: {
        patientId: ids.patientId,
        planId: ids.planId,
        planRevisionId: newRevision.id,
        occurredAt: new Date("2026-09-22T12:00:00Z"),
        professionalId: userId,
        professionalNameSnapshot: "Fisio Reav",
        evolution: "E2",
        idempotencyKey: key(),
        ...sign(),
      },
    });

    const stored = await prisma.treatmentSession.findMany({
      where: { id: { in: [oldSession.id, newSession.id] } },
      select: { id: true, planRevision: { select: { number: true, conduct: true } } },
      orderBy: { occurredAt: "asc" },
    });
    assert.deepEqual(stored.map((s) => s.planRevision), [
      { number: 1, conduct: "C1" },
      { number: 2, conduct: "C2" },
    ]);
    const linked = await prisma.reassessment.findUniqueOrThrow({
      where: { id: re.id },
      select: { planRevisionId: true, resultingRevision: { select: { number: true } } },
    });
    // A reavaliação continua apontando para a revisão de referência (1) e registra a que originou (2).
    assert.equal(linked.planRevisionId, ids.revisionId);
    assert.deepEqual(linked.resultingRevision, { number: 2 });
  });

  it("a comparação congelada não muda quando a avaliação de origem é editada depois", async () => {
    const ids = await newPlan();
    const re = await prisma.reassessment.create({ data: reassessmentData(ids) });
    await prisma.assessment.update({ where: { id: ids.assessmentId }, data: { rangeOfMotion: "100", version: 2 } });
    const stored = await prisma.reassessment.findUniqueOrThrow({ where: { id: re.id }, select: { referenceSnapshot: true } });
    assert.equal((stored.referenceSnapshot as { assessment: { rangeOfMotion: string } }).assessment.rangeOfMotion, "90");
  });

  it("histórico de correção: versão >= 2, motivo obrigatório e um campo por versão", async () => {
    const ids = await newPlan();
    const re = await prisma.reassessment.create({ data: reassessmentData(ids) });
    const change = { reassessmentId: re.id, version: 2, field: "conclusion", reason: "r", editorId: userId, editorNameSnapshot: "Fisio" };
    await prisma.reassessmentChange.create({ data: change });
    await assert.rejects(prisma.reassessmentChange.create({ data: change }));
    await assert.rejects(prisma.reassessmentChange.create({ data: { ...change, version: 1, field: "x" } }));
    await assert.rejects(prisma.reassessmentChange.create({ data: { ...change, version: 3, reason: " " } }));
  });
});
