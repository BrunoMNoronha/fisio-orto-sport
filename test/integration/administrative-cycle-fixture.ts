import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import type {PrismaClient} from '@/generated/prisma/client';
import {seedXmlCycle} from './xml-cycle-fixture';
import {beneficiaryMeta} from './beneficiary-fixture';
import {saveBeneficiary} from '@/modules/administrativo/beneficiary-service';
import {saveProduction} from '@/modules/administrativo/production-service';
import {saveGuide} from '@/modules/administrativo/guide-service';
import {saveBatch} from '@/modules/administrativo/batch-service';
import {saveTissProfile} from '@/modules/administrativo/tiss/profile-service';
import {TISS_DEFAULTS} from '@/modules/administrativo/tiss/profile';
import {generateBatchXml,exactXmlBytes} from '@/modules/administrativo/tiss/xml-service';
import {saveSettlement} from '@/modules/administrativo/settlement-service';
import {settlementSchema} from '@/modules/administrativo/settlement-validation';
import {readFinancialReport} from '@/modules/administrativo/financial-report-read';
import {financialReportCsv} from '@/modules/administrativo/financial-report-csv';

/** Test services and PostgreSQL, not session authorization or external homologation. */
export async function runAdministrativeCycle(db:PrismaClient,guideCount=1){
  assert(Number.isInteger(guideCount)&&guideCount>=1&&guideCount<=100,'Use 1 a 100 guias sintéticas.');
  const started=performance.now(),timings:Record<string,number>={};
  const admin=await db.user.create({data:{name:'ADMIN SINTETICO 106',email:randomUUID()+'@example.test',passwordHash:'not-a-password',role:'ADMIN'}});
  const professional=await db.user.create({data:{name:'FISIO SINTETICO 106',email:randomUUID()+'@example.test',passwordHash:'not-a-password',role:'FISIOTERAPEUTA'}});
  const reception=await db.user.create({data:{name:'RECEPCAO SINTETICA 106',email:randomUUID()+'@example.test',passwordHash:'not-a-password',role:'RECEPCAO'}});
  const inactive=await db.user.create({data:{name:'INATIVO SINTETICO 106',email:randomUUID()+'@example.test',passwordHash:'not-a-password',role:'ADMIN',active:false}});
  const f=await seedXmlCycle(db,admin.id,professional.id,5000);
  if(guideCount>1){
    await saveBeneficiary(db,admin.id,{kind:'item',values:{...f.item,...beneficiaryMeta(),id:f.item.id,expectedVersion:1,active:true,authorizedQuantity:guideCount*2}});
    // Updating the authorization invalidates the first guide's source digest.
    // Follow the operational correction flow instead of bypassing revalidation.
    await saveGuide(db,admin.id,{...f.g,operation:'DEVOLVER',expectedVersion:1,requestId:randomUUID()},true);
    await saveGuide(db,admin.id,{...f.g,operation:'CONFERIR',expectedVersion:2,requestId:randomUUID()},true);
    for(let index=1;index<guideCount;index++){
      const session=await f.session(),p={...f.p,id:randomUUID(),requestId:randomUUID(),expectedVersion:0,sessionId:session.id};
      await saveProduction(db,admin.id,p);
      const g={...f.g,id:randomUUID(),requestId:randomUUID(),expectedVersion:0,productionIds:[p.id]};
      await saveGuide(db,admin.id,g,true);f.guideIds.push(g.id);f.productions.push(p.id);
    }
  }
  // PRODUCAO is a technical fixture flag only: fictional confirmation in a disposable DB.
  await saveTissProfile(db,admin.id,{...beneficiaryMeta(),contractId:f.contractId,data:{...TISS_DEFAULTS,mode:'PRODUCAO',pilotName:'PILOTO FICTICIO LOCAL 106',manualReference:'SEM MANUAL REAL; TESTE LOCAL',homologationChannel:'SEM CANAL EXTERNO; NAO ENVIAR',acceptedVersionConfirmed:true}});
  const input=f.input();await saveBatch(db,admin.id,input);
  timings.prepareMs=performance.now()-started;
  const closeStart=performance.now();
  const close={...input,operation:'FECHAR' as const,expectedVersion:1,requestId:randomUUID()};
  await Promise.all([saveBatch(db,admin.id,close),saveBatch(db,admin.id,close)]);
  timings.closeMs=performance.now()-closeStart;
  const xmlStart=performance.now(),xmlInput={batchId:input.id,expectedVersion:2,requestId:randomUUID(),reason:'XML exclusivamente sintético local 106'};
  const artifactId=await generateBatchXml(db,admin.id,xmlInput);
  assert.equal(await generateBatchXml(db,admin.id,xmlInput),artifactId);
  const artifact=await db.batchArtifact.findUniqueOrThrow({where:{id:artifactId}});
  assert.equal(createHash('sha256').update(exactXmlBytes(artifact)).digest('hex'),artifact.fileHash);
  assert.equal(await db.operatorReceivable.count({where:{batchId:input.id}}),0,'XML/fechamento não constitui obrigação');
  timings.xmlMs=performance.now()-xmlStart;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const send={...input,operation:'ENVIAR' as const,expectedVersion:2,requestId:randomUUID(),artifactId,sentOn:new Date(today),protocol:'PROTOCOLO FICTICIO LOCAL 106',channel:'SIMULACAO LOCAL SEM TRANSMISSAO'};
  await Promise.all([saveBatch(db,admin.id,send),saveBatch(db,admin.id,send)]);
  const event=(kind:'RECEBER'|'GLOSAR',amount:string)=>settlementSchema.parse({id:randomUUID(),requestId:randomUUID(),contractId:f.contractId,kind,amount,effectiveOn:today,reference:'DEMONSTRATIVO FICTICIO 106',reason:'Validação local sem operação financeira real',lines:[{receivableId:f.p.id,amount,...(kind==='GLOSAR'?{code:'SINT-106'}:{})}]});
  const receipt=event('RECEBER','60,00');
  await Promise.all([saveSettlement(db,admin.id,receipt),saveSettlement(db,admin.id,receipt)]);
  const glosa=event('GLOSAR','20,00');await saveSettlement(db,admin.id,glosa);
  const reportStart=performance.now();
  for(const kind of ['faturamento','conciliacao'] as const){
    const report=await readFinancialReport(db,kind,{axis:'envio',contractId:f.contractId,page:1},'all');
    assert.equal(report.error,null);assert.equal(report.total,kind==='faturamento'?1:guideCount);
    const t=report.totals[0];assert.equal(t.billed,BigInt(guideCount)*BigInt(10000));
    assert.equal(t.received,BigInt(6000));assert.equal(t.analysis,BigInt(2000));assert.equal(t.writtenOff,BigInt(0));
    assert.equal(t.open,t.billed-BigInt(8000));assert.equal(t.billed,t.received+t.analysis+t.open+t.writtenOff);
    const csv=financialReportCsv(report);assert(!csv.includes('SEGREDO CLINICO'));assert(!csv.includes('DADO CLINICO'));
  }
  timings.reportsMs=performance.now()-reportStart;
  const uses=await db.authorizationUse.aggregate({where:{itemId:f.item.id},_sum:{quantity:true}});
  assert.equal(uses._sum.quantity,guideCount*2);
  const authorization=await db.authorizationItem.findUniqueOrThrow({where:{id:f.item.id}});
  assert.equal(await db.charge.count({where:{patientId:f.patientId}}),0,'Sessões/produção não criam cobrança de paciente');
  assert.equal(await db.batchSend.count({where:{batchId:input.id}}),1);
  assert.equal(await db.batchArtifact.count({where:{batchId:input.id}}),1);
  assert.equal(await db.operatorReceivable.count({where:{batchId:input.id}}),guideCount);
  for(const change of await db.batchChange.findMany({where:{batchId:input.id}}))assert.equal(change.actorId,admin.id);
  for(const change of await db.operatorSettlement.findMany({where:{contractId:f.contractId}}))assert.equal(change.actorId,admin.id);
  timings.totalMs=performance.now()-started;
  return {fixtureVersion:1,synthetic:true,externalHomologation:'PENDENTE',users:{admin:admin.id,professional:professional.id,reception:reception.id,inactive:inactive.id},patientId:f.patientId,contractId:f.contractId,authorizationItemId:f.item.id,productionId:f.p.id,guideId:f.g.id,batchId:input.id,artifactId,receiptId:receipt.id,glosaId:glosa.id,guideCount,itemCount:guideCount,authorized:authorization.authorizedQuantity,consumed:uses._sum.quantity,available:authorization.authorizedQuantity-(uses._sum.quantity??0),billedCents:String(guideCount*10000),receivedCents:'6000',analysisCents:'2000',openCents:String(guideCount*10000-8000),writtenOffCents:'0',xml:{bytes:artifact.bytes.length,sha256:artifact.fileHash,contentDigest:artifact.contentDigest,validation:artifact.validationMetadata},timings};
}
