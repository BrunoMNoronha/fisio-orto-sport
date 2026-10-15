import {randomUUID,randomInt} from "node:crypto";
import {PrismaClient} from "@/generated/prisma/client";
import {seedBeneficiary,beneficiaryMeta} from "./beneficiary-fixture";
import {saveProduction} from "@/modules/administrativo/production-service";
import {productionSchema} from "@/modules/administrativo/production-validation";
import {saveAdministrativeConfig} from "@/modules/administrativo/service";
import {saveGuide,saveGuideProfile} from "@/modules/administrativo/guide-service";
import {guideSchema,DEFAULT_GUIDE_RULES} from "@/modules/administrativo/guide-validation";
import {batchSchema} from "@/modules/administrativo/batch-validation";




export async function seedSettlementBatch(db:PrismaClient,actor:string,professional:string){
  async function fixture() {
    const f = await seedBeneficiary(db, actor);
    const a = await db.anamnesis.create({ data: { patientId: f.patientId, authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO', assessmentDate: new Date('2026-01-01'), chiefComplaint: 'DADO CLINICO SECRETO' } });
    const assessment = await db.assessment.create({ data: { patientId: f.patientId, anamnesisId: a.id, authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO', assessmentDate: new Date('2026-01-01'), diagnosis: 'DADO CLINICO SECRETO' } });
    const plan = await db.therapyPlan.create({ data: { patientId: f.patientId, assessmentId: assessment.id, assessmentVersion: 1, authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO', revisions: { create: { number: 1, kind: 'INICIAL', planDate: new Date('2026-01-01'), goals: 'SINTETICO', conduct: 'SINTETICO', authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO' } } }, include: { revisions: true } });
    const session = async () => db.treatmentSession.create({ data: { patientId: f.patientId, planId: plan.id, planRevisionId: plan.revisions[0].id, occurredAt: new Date('2026-01-16T02:30:00Z'), professionalId: professional, professionalNameSnapshot: 'FISIO SINTETICO', evolution: 'DADO CLINICO SECRETO', idempotencyKey: randomUUID(), authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO' } });
    const s = await session();
    const tariff = { ...beneficiaryMeta(), active: true, procedureId: f.procedureId, amount: 5000, startsOn: new Date('2026-01-01'), endsOn: null };
    await saveAdministrativeConfig(db, actor, { kind: 'tariff', values: tariff });
    const input = (patch = {}) => productionSchema.parse({ ...beneficiaryMeta(), sessionId: s.id, coverageId: f.coverage.id, procedureId: f.procedureId, quantity: '2', endTime: '', authorizationItemId: f.item.id, operation: 'CONFERIR', ...patch });
    return { ...f, s, session, input, tariff };
  }

  async function guideFixture() {
    const f = await fixture(); const p = f.input(); await saveProduction(db, actor, p);
    const g = (patch = {}) => guideSchema.parse({ id: randomUUID(), requestId: randomUUID(), expectedVersion: 0, reason: 'Teste sintético', operation: 'SALVAR', coverageId: f.coverage.id, authorizationId: f.authorization.id, month: '2026-01', requesterId: '', requestedOn: '', characterCode: '', attendanceCode: '', regimeCode: '', accidentCode: '', productionIds: [p.id], ...patch });
    return { ...f, p, g };
  }
  async function complete(f: Awaited<ReturnType<typeof guideFixture>>) {
    const c = await db.operatorContract.findUniqueOrThrow({ where: { id: f.contractId } }); const o = await db.healthOperator.findUniqueOrThrow({ where: { id: c.operatorId } });
    await saveAdministrativeConfig(db, actor, { kind: 'operator', values: { ...o, ...beneficiaryMeta(), id: o.id, expectedVersion: o.version, active: true, registrationAns: String(randomInt(900000, 999999)) } });
    await saveAdministrativeConfig(db, actor, { kind: 'contract', values: { ...c, ...beneficiaryMeta(), id: c.id, expectedVersion: c.version, active: true, providerCode: 'SINT-101', manualReference: 'Manual sintético 101', tissVersion: '04.03.00' } });
    await db.clinicSettings.upsert({ where: { id: 1 }, create: { id: 1, legalName: 'CLINICA SINTETICA 101', cnpj: '99999999000199', updatedById: actor }, update: { legalName: 'CLINICA SINTETICA 101', cnpj: '99999999000199', updatedById: actor } });
    const requester = randomUUID(); await saveAdministrativeConfig(db, actor, { kind: 'professional', values: { ...beneficiaryMeta(), id: requester, active: true, userId: null, name: 'SOLICITANTE SINTETICO', purpose: 'SOLICITANTE', councilCode: '99', councilNumber: 'SINT-101', councilState: 'SP', occupationCode: '999999' } });
    const existing = await db.billingProfessional.findUnique({ where: { userId: professional } }); if (!existing) await saveAdministrativeConfig(db, actor, { kind: 'professional', values: { ...beneficiaryMeta(), active: true, userId: professional, name: 'EXECUTANTE SINTETICO', purpose: 'EXECUTANTE', councilCode: '99', councilNumber: 'EXEC-101', councilState: 'SP', occupationCode: '999999' } });
    await saveGuideProfile(db, actor, { ...beneficiaryMeta(), contractId: c.id, reference: 'Perfil sintético, sem homologação', rules: { ...DEFAULT_GUIDE_RULES, characterCodes: ['SINT'], attendanceCodes: ['SINT'], regimeCodes: ['SINT'], accidentCodes: ['SINT'] } });
    return { requesterId: requester, requestedOn: '2026-01-01', characterCode: 'SINT', attendanceCode: 'SINT', regimeCode: 'SINT', accidentCode: 'SINT' };
  }

async function batchFixture(two=false){const f=await guideFixture(),fields=await complete(f);const g=f.g({...fields,operation:'CONFERIR',clinicalIndication:'SEGREDO CLINICO SINTETICO 102',clinicalConfirmed:true});await saveGuide(db,actor,g,true);const guideIds=[g.id];const productions=[f.p.id];if(two){const session=await f.session(),p=f.input({sessionId:session.id});await saveProduction(db,actor,p);const second=f.g({...fields,operation:'CONFERIR',productionIds:[p.id]});await saveGuide(db,actor,second);guideIds.push(second.id);productions.push(p.id);}
 const input=(patch={})=>batchSchema.parse({id:randomUUID(),requestId:randomUUID(),expectedVersion:0,reason:'Teste sintético 102',operation:'SALVAR',contractId:f.contractId,tissVersion:'04.03.00',guideIds,...patch});return {...f,g,guideIds,productions,input};}

return batchFixture();
}
