import {generateBatchXml,exactXmlBytes} from "@/modules/administrativo/tiss/xml-service";
import {saveTissProfile} from "@/modules/administrativo/tiss/profile-service";
import {TISS_DEFAULTS} from "@/modules/administrativo/tiss/profile";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import {randomUUID,randomInt} from "node:crypto";
import {before,after,describe,it} from "node:test";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "@/generated/prisma/client";
import {seedBeneficiary,beneficiaryMeta} from "./beneficiary-fixture";
import {saveProduction} from "@/modules/administrativo/production-service";
import {productionSchema} from "@/modules/administrativo/production-validation";
import {saveAdministrativeConfig} from "@/modules/administrativo/service";
import {saveGuide,saveGuideProfile} from "@/modules/administrativo/guide-service";
import {guideSchema,DEFAULT_GUIDE_RULES} from "@/modules/administrativo/guide-validation";
import {saveBatch} from "@/modules/administrativo/batch-service";
import {batchSchema} from "@/modules/administrativo/batch-validation";
const url=process.env.INTEGRATION_DATABASE_URL;if(process.env.CI&&!url)throw new Error('Banco obrigatório');
describe('XML TISS PostgreSQL (#103)',{skip:!url},()=>{
let db:PrismaClient,other:PrismaClient,actor:string,professional:string;
before(async()=>{db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});other=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});actor=(await db.user.create({data:{name:'ADMIN SINTETICO 102',email:`adm102-${randomUUID()}@example.test`,passwordHash:'x',role:'ADMIN'}})).id;professional=(await db.user.create({data:{name:'FISIO SINTETICO 102',email:`fisio102-${randomUUID()}@example.test`,passwordHash:'x',role:'FISIOTERAPEUTA'}})).id;});
after(async()=>{await db?.$disconnect();await other?.$disconnect();});
  async function fixture() {
    const f = await seedBeneficiary(db, actor,undefined,{tableCode:'22',code:'00000001'});
    const a = await db.anamnesis.create({ data: { patientId: f.patientId, authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO', assessmentDate: new Date('2026-01-01'), chiefComplaint: 'DADO CLINICO SECRETO' } });
    const assessment = await db.assessment.create({ data: { patientId: f.patientId, anamnesisId: a.id, authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO', assessmentDate: new Date('2026-01-01'), diagnosis: 'DADO CLINICO SECRETO' } });
    const plan = await db.therapyPlan.create({ data: { patientId: f.patientId, assessmentId: assessment.id, assessmentVersion: 1, authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO', revisions: { create: { number: 1, kind: 'INICIAL', planDate: new Date('2026-01-01'), goals: 'SINTETICO', conduct: 'SINTETICO', authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO' } } }, include: { revisions: true } });
    const session = async () => db.treatmentSession.create({ data: { patientId: f.patientId, planId: plan.id, planRevisionId: plan.revisions[0].id, occurredAt: new Date('2026-01-16T02:30:00Z'), professionalId: professional, professionalNameSnapshot: 'FISIO SINTETICO', evolution: 'DADO CLINICO SECRETO', idempotencyKey: randomUUID(), authorId: actor, authorNameSnapshot: 'ADMIN SINTETICO' } });
    const s = await session();
    const tariff = { ...beneficiaryMeta(), active: true, procedureId: f.procedureId, amount: 5237, startsOn: new Date('2026-01-01'), endsOn: null };
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
    await saveAdministrativeConfig(db, actor, { kind: 'contract', values: { ...c, ...beneficiaryMeta(), id: c.id, expectedVersion: c.version, active: true, providerCode: '0000123',cnes:'0000001', manualReference: 'Manual sintético 101', tissVersion: '04.03.00' } });
    await db.clinicSettings.upsert({ where: { id: 1 }, create: { id: 1, legalName: 'CLINICA SINTETICA 101', cnpj: '99999999000199', updatedById: actor }, update: { legalName: 'CLINICA SINTETICA 101', cnpj: '99999999000199', updatedById: actor } });
    const requester = randomUUID(); await saveAdministrativeConfig(db, actor, { kind: 'professional', values: { ...beneficiaryMeta(), id: requester, active: true, userId: null, name: 'SOLICITANTE SINTETICO', purpose: 'SOLICITANTE', councilCode: '05', councilNumber: 'SINT-101', councilState: 'SP', occupationCode: '223605' } });
    const existing = await db.billingProfessional.findUnique({ where: { userId: professional } }); if (!existing) await saveAdministrativeConfig(db, actor, { kind: 'professional', values: { ...beneficiaryMeta(), active: true, userId: professional, name: 'EXECUTANTE SINTETICO', purpose: 'EXECUTANTE', councilCode: '05', councilNumber: 'EXEC-101', councilState: 'SP', occupationCode: '223605' } });
    await saveGuideProfile(db, actor, { ...beneficiaryMeta(), contractId: c.id, reference: 'Perfil sintético, sem homologação', rules: { ...DEFAULT_GUIDE_RULES, characterCodes: ['1'], attendanceCodes: ['03'], regimeCodes: ['01'], accidentCodes: ['9'] } });
    return { requesterId: requester, requestedOn: '2026-01-01', characterCode: '1', attendanceCode: '03', regimeCode: '01', accidentCode: '9',newbornCode:'N',requesterProviderCode:'0000456',requesterProviderName:'CONTRATADO SINTÉTICO'  };
  }

async function batchFixture(two=false){const f=await guideFixture(),fields=await complete(f);const g=f.g({...fields,operation:'CONFERIR',clinicalIndication:'SEGREDO CLINICO SINTETICO 102',clinicalConfirmed:true});await saveGuide(db,actor,g,true);const guideIds=[g.id];const productions=[f.p.id];if(two){const session=await f.session(),p=f.input({sessionId:session.id});await saveProduction(db,actor,p);const second=f.g({...fields,operation:'CONFERIR',productionIds:[p.id]});await saveGuide(db,actor,second);guideIds.push(second.id);productions.push(p.id);}
 const input=(patch={})=>batchSchema.parse({id:randomUUID(),requestId:randomUUID(),expectedVersion:0,reason:'Teste sintético 102',operation:'SALVAR',contractId:f.contractId,tissVersion:'04.03.00',guideIds,...patch});return {...f,g,guideIds,productions,input};}
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());


async function closed(mode:'HOMOLOGACAO'|'PRODUCAO'='HOMOLOGACAO'){
 const f=await batchFixture();await saveTissProfile(db,actor,{...beneficiaryMeta(),contractId:f.contractId,data:{...TISS_DEFAULTS,mode,pilotName:'OPERADORA SINTÉTICA',manualReference:'Manual sintético de teste',homologationChannel:'Canal sintético',acceptedVersionConfirmed:mode==='PRODUCAO'}});
 const b=f.input();await saveBatch(db,actor,b);await saveBatch(db,actor,{...b,operation:'FECHAR',expectedVersion:1,requestId:randomUUID()});const input={batchId:b.id,expectedVersion:2,requestId:randomUUID(),reason:'Geração sintética'};return {...f,b,input};
}
it('gera, valida XSD e preserva bytes; replay simultâneo cria um único artefato e não envia',async()=>{const f=await closed();const [a,b]=await Promise.all([generateBatchXml(db,actor,f.input),generateBatchXml(other,actor,f.input)]);assert.equal(a,b);const file=await db.batchArtifact.findUniqueOrThrow({where:{id:a}});assert.equal(file.purpose,'HOMOLOGACAO');assert.equal(file.generatorVersion,'4.03.00-1');assert.equal(createHash('sha256').update(file.bytes).digest('hex'),file.fileHash);assert.match(Buffer.from(file.bytes).toString('latin1'),/0000123/);assert.equal(await db.batchArtifact.count({where:{batchId:f.b.id}}),1);assert.equal(await db.batchSend.count({where:{batchId:f.b.id}}),0);assert.equal((await db.billingBatch.findUniqueOrThrow({where:{id:f.b.id}})).state,'FECHADO');await assert.rejects(saveBatch(db,actor,{...f.b,operation:'ENVIAR',expectedVersion:2,requestId:randomUUID(),artifactId:a,sentOn:new Date(today()),protocol:'SINT',channel:'MANUAL'}),/homologação/);await assert.rejects(generateBatchXml(db,actor,{...f.input,reason:'Alteração do replay'}),/reutilizado/);
 const clinic=await db.clinicSettings.findUniqueOrThrow({where:{id:1}});await db.clinicSettings.update({where:{id:1},data:{legalName:clinic.legalName+' ALTERADA'}});assert.deepEqual(exactXmlBytes(file),file.bytes);const regenerated=await generateBatchXml(db,actor,{...f.input,requestId:randomUUID()});const second=await db.batchArtifact.findUniqueOrThrow({where:{id:regenerated}});assert.deepEqual(second.bytes,file.bytes);assert.equal(second.version,2);assert.equal(second.contentDigest,file.contentDigest);
});
it('falha de armazenamento desfaz artefato e não registra estado/envio parcial',async()=>{const f=await closed(),broken=db.$extends({query:{batchArtifact:{async create(){throw new Error('Falha sintética de armazenamento');}}}});await assert.rejects(generateBatchXml(broken as unknown as Pick<PrismaClient,'$transaction'>,actor,f.input),/Falha sintética/);assert.equal(await db.batchArtifact.count({where:{batchId:f.b.id}}),0);assert.equal(await db.batchSend.count({where:{batchId:f.b.id}}),0);assert.equal((await db.billingBatch.findUniqueOrThrow({where:{id:f.b.id}})).state,'FECHADO');});
it('perfil confirmado permite arquivo de produção e envio manual sem geração automática de obrigação',async()=>{const f=await closed('PRODUCAO'),id=await generateBatchXml(db,actor,f.input),file=await db.batchArtifact.findUniqueOrThrow({where:{id}});assert.equal(file.purpose,'PRODUCAO');assert.equal(await db.batchSend.count({where:{batchId:f.b.id}}),0);await saveBatch(db,actor,{...f.b,operation:'ENVIAR',expectedVersion:2,requestId:randomUUID(),artifactId:id,sentOn:new Date(today()),protocol:'PROT SINT',channel:'MANUAL'});assert.equal(await db.batchSend.count({where:{batchId:f.b.id}}),1);assert.equal(await db.charge.count({where:{patientId:f.patientId}}),0);await assert.rejects(db.batchArtifact.update({where:{id},data:{bytes:new Uint8Array([1])}}));});
it('perfil é append-only, versionado e idempotente sob concorrência',async()=>{const f=await batchFixture(),input={...beneficiaryMeta(),contractId:f.contractId,data:TISS_DEFAULTS};const ids=await Promise.all([saveTissProfile(db,actor,input),saveTissProfile(other,actor,input)]);assert.equal(ids[0],ids[1]);await assert.rejects(saveTissProfile(db,actor,{...input,requestId:randomUUID()}),/alterado/);await assert.rejects(db.tissProfile.update({where:{id:ids[0]},data:{reason:'Sobrescrever'}}));});
it('serialização/restauração transacional preserva bytes, hash e vínculo sem regenerar',async()=>{const f=await closed(),id=await generateBatchXml(db,actor,f.input);const source=await db.batchArtifact.findUniqueOrThrow({where:{id}});await db.$transaction(async tx=>{const encoded=await tx.$queryRaw<{bytes:string;hash:string;batchId:string;contentDigest:string}[]>`SELECT encode(bytes,'base64') AS bytes,"fileHash" AS hash,"batchId","contentDigest" FROM "BatchArtifact" WHERE id=${id}`;await tx.$executeRawUnsafe('CREATE TEMP TABLE "XmlRestore103"(bytes bytea,hash text,"batchId" text,"contentDigest" text) ON COMMIT DROP');await tx.$executeRaw`INSERT INTO "XmlRestore103" VALUES(decode(${encoded[0].bytes},'base64'),${encoded[0].hash},${encoded[0].batchId},${encoded[0].contentDigest})`;const restored=await tx.$queryRaw<{bytes:Uint8Array;hash:string;batchId:string;contentDigest:string}[]>`SELECT * FROM "XmlRestore103"`;assert.deepEqual(restored[0].bytes,source.bytes);assert.equal(restored[0].hash,source.fileHash);assert.equal(restored[0].batchId,source.batchId);assert.equal(restored[0].contentDigest,source.contentDigest);});});
});
