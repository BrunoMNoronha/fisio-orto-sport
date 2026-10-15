import {seedXmlCycle} from './xml-cycle-fixture';
import {beneficiaryMeta} from './beneficiary-fixture';
import {randomUUID} from 'node:crypto';
import {generateBatchXml,exactXmlBytes} from "@/modules/administrativo/tiss/xml-service";
import {saveTissProfile} from "@/modules/administrativo/tiss/profile-service";
import {TISS_DEFAULTS} from "@/modules/administrativo/tiss/profile";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";

import {before,after,describe,it} from "node:test";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "@/generated/prisma/client";

import {saveBatch} from "@/modules/administrativo/batch-service";

const url=process.env.INTEGRATION_DATABASE_URL;if(process.env.CI&&!url)throw new Error('Banco obrigatório');
describe('XML TISS PostgreSQL (#103)',{skip:!url},()=>{
let db:PrismaClient,other:PrismaClient,actor:string,professional:string;
before(async()=>{db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});other=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});actor=(await db.user.create({data:{name:'ADMIN SINTETICO 102',email:`adm102-${randomUUID()}@example.test`,passwordHash:'x',role:'ADMIN'}})).id;professional=(await db.user.create({data:{name:'FISIO SINTETICO 102',email:`fisio102-${randomUUID()}@example.test`,passwordHash:'x',role:'FISIOTERAPEUTA'}})).id;});
after(async()=>{await db?.$disconnect();await other?.$disconnect();});
const batchFixture=()=>seedXmlCycle(db,actor,professional);
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
