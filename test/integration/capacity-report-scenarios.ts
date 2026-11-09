import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import type {PrismaClient} from '@/generated/prisma/client';
import {readAdministrativeReport} from '@/modules/administrativo/report-read';
import {administrativeReportCsv} from '@/modules/administrativo/report-csv';
import {readFinancialReport} from '@/modules/administrativo/financial-report-read';
import {financialReportCsv} from '@/modules/administrativo/financial-report-csv';
import {readBatchReport} from '@/modules/administrativo/batch-read';
import {saveBeneficiary} from '@/modules/administrativo/beneficiary-service';
import {saveAdministrativeConfig} from '@/modules/administrativo/service';
import {saveProduction} from '@/modules/administrativo/production-service';
import {productionSchema} from '@/modules/administrativo/production-validation';
import {saveGuide} from '@/modules/administrativo/guide-service';
import {guideSchema} from '@/modules/administrativo/guide-validation';
import {saveBatch} from '@/modules/administrativo/batch-service';
import {batchSchema} from '@/modules/administrativo/batch-validation';
import {generateBatchXml} from '@/modules/administrativo/tiss/xml-service';
import type {runAdministrativeCycle} from './administrative-cycle-fixture';
type Cycle=Awaited<ReturnType<typeof runAdministrativeCycle>>;
const meta=()=>({id:randomUUID(),requestId:randomUUID(),expectedVersion:0,reason:'Capacidade sintética local 131'});

/** Adds one real domain item after the complete export, to exercise max+1. */
export async function addCapacityItem(db:PrismaClient,cycle:Cycle){
  const actor=cycle.users.admin,original=await db.productionItem.findUniqueOrThrow({where:{id:cycle.productionId}});
  const s=await db.treatmentSession.findUniqueOrThrow({where:{id:original.sessionId}});
  const auth=await db.authorizationItem.findUniqueOrThrow({where:{id:cycle.authorizationItemId}});
  await saveBeneficiary(db,actor,{kind:'item',values:{...meta(),id:auth.id,expectedVersion:auth.version,authorizationId:auth.authorizationId,contractId:auth.contractId,procedureId:auth.procedureId,active:true,authorizedQuantity:auth.authorizedQuantity+2}});
  const session=await db.treatmentSession.create({data:{patientId:s.patientId,planId:s.planId,planRevisionId:s.planRevisionId,occurredAt:s.occurredAt,professionalId:s.professionalId,professionalNameSnapshot:s.professionalNameSnapshot,evolution:'DADO CLINICO SINTETICO',idempotencyKey:randomUUID(),authorId:actor,authorNameSnapshot:'ADMIN SINTETICO'}});
  const p=productionSchema.parse({...meta(),sessionId:session.id,coverageId:original.coverageId,procedureId:original.procedureId,quantity:'2',endTime:'',authorizationItemId:auth.id,operation:'CONFERIR'});
  await saveProduction(db,actor,p);
  const g=await db.billingGuide.findUniqueOrThrow({where:{id:cycle.guideId}});
  const guide=guideSchema.parse({...meta(),operation:'CONFERIR',coverageId:g.coverageId,authorizationId:g.authorizationId,month:g.month,requesterId:g.requesterId,requestedOn:g.requestedOn?.toISOString().slice(0,10),characterCode:g.characterCode,attendanceCode:g.attendanceCode,regimeCode:g.regimeCode,accidentCode:g.accidentCode,newbornCode:g.newbornCode,requesterProviderCode:g.requesterProviderCode,requesterProviderName:g.requesterProviderName,clinicalIndication:g.clinicalIndication,clinicalConfirmed:g.clinicalConfirmed,productionIds:[p.id]});
  await saveGuide(db,actor,guide,true);
  const batch=batchSchema.parse({...meta(),operation:'SALVAR',contractId:g.contractId,tissVersion:'04.03.00',guideIds:[guide.id]});
  await saveBatch(db,actor,batch);await saveBatch(db,actor,{...batch,operation:'FECHAR',expectedVersion:1,requestId:randomUUID()});
  const artifactId=await generateBatchXml(db,actor,{batchId:batch.id,expectedVersion:2,requestId:randomUUID(),reason:'Capacidade max+1 local'});
  await saveBatch(db,actor,{...batch,operation:'ENVIAR',expectedVersion:2,requestId:randomUUID(),artifactId,sentOn:new Date(new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date())),channel:'SIMULADO LOCAL',protocol:'SINTETICO 131'});
  return {productionId:p.id,batchId:batch.id};
}

export async function verifyCapacityReports(db:PrismaClient,cycles:Cycle[],expected=10000,scope:{contractId?:string}={},onCsv:(type:string,csv:string)=>void=()=>{}){
  const started=performance.now(),results=[];
  assert.equal(cycles.reduce((n,c)=>n+c.itemCount,0),expected);
  for(const type of ['producao','conciliacao'] as const){
    const start=performance.now();
    const full=type==='producao'?await readAdministrativeReport(db,'producao',{...scope,page:1,state:'ENVIADO'},'all'):await readFinancialReport(db,'conciliacao',{...scope,axis:'envio',page:1},'all');
    assert.equal(full.error,null);assert.equal(full.total,expected);assert.equal(full.items.length,expected);
    const total=type==='producao'?(full as Awaited<ReturnType<typeof readAdministrativeReport>>).totals.reduce((n,t)=>n+(t.amountCents??BigInt(0)),BigInt(0)):(full as Awaited<ReturnType<typeof readFinancialReport>>).totals.reduce((n,t)=>n+t.billed,BigInt(0));
    assert.equal(total,BigInt(expected)*BigInt(10000));
    const csv=type==='producao'?administrativeReportCsv(full as Awaited<ReturnType<typeof readAdministrativeReport>>):financialReportCsv(full as Awaited<ReturnType<typeof readFinancialReport>>);
    assert.equal(csv.split('\r\n').filter(row=>row.startsWith('"ITEM";')).length,expected);
    assert(!csv.includes('DADO CLINICO'));assert(!csv.includes('SEGREDO CLINICO'));assert(!csv.includes('000SENHA'));
    onCsv(type,csv);
    const last=type==='producao'?await readAdministrativeReport(db,'producao',{...scope,page:Math.ceil(expected/20),state:'ENVIADO'}):await readFinancialReport(db,'conciliacao',{...scope,axis:'envio',page:Math.ceil(expected/20)});
    assert.equal(last.items.length,expected===0?0:(expected-1)%20+1);assert.deepEqual(last.totals,full.totals);
    results.push({type,rows:full.items.length,totalCents:String(total),csvBytes:Buffer.byteLength(csv),csvSha256:createHash('sha256').update(csv).digest('hex'),readAndCsvMs:performance.now()-start});
    // mode=all is also the exact source used by the print route; no browser PDF claim.
  }
  const batchReport=await readFinancialReport(db,'faturamento',{...scope,axis:'envio',page:1},'all');assert.equal(batchReport.total,cycles.length);assert.equal(batchReport.totals.reduce((n,t)=>n+t.itemCount,BigInt(0)),BigInt(expected));
  const sample=await readBatchReport(db,cycles[0].batchId,1,true);assert.equal(sample?.rows.length,cycles[0].itemCount);assert.equal(sample.totalCents,BigInt(cycles[0].billedCents));
  return {results,batchRows:batchReport.total,printSourceRows:expected,totalMs:performance.now()-started};
}

export async function verifyExportRefusal(db:PrismaClient,expected=10001,scope:{contractId?:string}={}){
  for(const type of ['producao','conciliacao'] as const){
    const full=type==='producao'?await readAdministrativeReport(db,'producao',{...scope,page:1,state:'ENVIADO'},'all'):await readFinancialReport(db,'conciliacao',{...scope,axis:'envio',page:1},'all');
    assert.equal(full.total,expected);assert.equal(full.items.length,0);assert(full.error);
    const page=type==='producao'?await readAdministrativeReport(db,'producao',{...scope,page:1,state:'ENVIADO'}):await readFinancialReport(db,'conciliacao',{...scope,axis:'envio',page:1});assert.equal(page.items.length,Math.min(20,expected));assert.equal(page.total,expected);
  }
  return {rows:expected,refused:true,pageRows:20};
}

export async function verifyXmlPersistenceRefusal(db:PrismaClient,cycle:Cycle){
  const contract=await db.operatorContract.findUniqueOrThrow({where:{id:cycle.contractId}});
  const artifacts=await db.batchArtifact.count({where:{batchId:cycle.batchId}}),sends=await db.batchSend.count({where:{batchId:cycle.batchId}});
  const artifact=await db.batchArtifact.findUniqueOrThrow({where:{id:cycle.artifactId}});
  const original=Buffer.from(artifact.bytes);
  await saveAdministrativeConfig(db,cycle.users.admin,{kind:'contract',values:{...contract,...meta(),id:contract.id,expectedVersion:contract.version,maxXmlBytes:artifact.bytes.length-1,active:true}});
  try{await assert.rejects(generateBatchXml(db,cycle.users.admin,{batchId:cycle.batchId,expectedVersion:3,requestId:randomUUID(),reason:'Excesso de bytes sintético'}),/limite/);}
  finally{const current=await db.operatorContract.findUniqueOrThrow({where:{id:contract.id}});await saveAdministrativeConfig(db,cycle.users.admin,{kind:'contract',values:{...current,...meta(),id:contract.id,expectedVersion:current.version,maxXmlBytes:contract.maxXmlBytes,active:true}});}
  assert.equal(await db.batchArtifact.count({where:{batchId:cycle.batchId}}),artifacts);assert.equal(await db.batchSend.count({where:{batchId:cycle.batchId}}),sends);
  assert.deepEqual(Buffer.from((await db.batchArtifact.findUniqueOrThrow({where:{id:artifact.id}})).bytes),original);
  return {limit:artifact.bytes.length-1,refused:true,artifacts,sends,originalPreserved:true};
}
