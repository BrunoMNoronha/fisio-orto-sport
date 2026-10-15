import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@/generated/prisma/client';
import {seedSettlementBatch} from './settlement-fixture';
import {saveBatch,registerValidatedBatchArtifactTx} from '@/modules/administrativo/batch-service';
import {saveProduction} from '@/modules/administrativo/production-service';
import {saveGuide} from '@/modules/administrativo/guide-service';
import {saveSettlement} from '@/modules/administrativo/settlement-service';
import {settlementSchema,type SettlementInput} from '@/modules/administrativo/settlement-validation';

export async function seedFinancialReport(db:PrismaClient,actor:string,professional:string){
  const f=await seedSettlementBatch(db,actor,professional);
  async function batch(guideId=f.g.id,sentOn:string|null='2026-02-01'){
    const stamp=new Date('2026-02-01T02:30:00Z'); // fechamento civil 31/01, instante UTC 01/02
    const clock=db.$extends({query:{billingBatch:{async update({args,query}){if(args.data.state==='FECHADO')args.data.closedAt=stamp;return query(args);}},batchArtifact:{async create({args,query}){args.data.createdAt=stamp;return query(args);}}}});
    const client=clock as unknown as Pick<PrismaClient,'$transaction'>;
    const input=f.input({guideIds:[guideId]});await saveBatch(db,actor,input);await saveBatch(client,actor,{...input,operation:'FECHAR',expectedVersion:1,requestId:randomUUID()});
    if(sentOn){
      const b=await db.billingBatch.findUniqueOrThrow({where:{id:input.id}}),file=await client.$transaction(tx=>registerValidatedBatchArtifactTx(tx,actor,{id:randomUUID(),requestId:randomUUID(),batchId:b.id,contentDigest:b.contentDigest,bytes:new TextEncoder().encode('FIXTURE RELATORIO DOMINIO SEM XSD'),validationReference:'Fixture interna sem homologação',purpose:'PRODUCAO'}));
      await saveBatch(db,actor,{...input,operation:'ENVIAR',expectedVersion:2,requestId:randomUUID(),artifactId:file.id,sentOn:new Date(sentOn),protocol:'PROTOCOLO SINTETICO 105',channel:'MANUAL SINTETICO'});
    }
    return input.id;
  }
  async function additional(sentOn:string|null='2026-02-01'){
    const s=await f.session(),p={...f.p,id:randomUUID(),requestId:randomUUID(),expectedVersion:0,sessionId:s.id,quantity:1};await saveProduction(db,actor,p);
    const g={...f.g,id:randomUUID(),requestId:randomUUID(),expectedVersion:0,productionIds:[p.id]};await saveGuide(db,actor,g,true);
    return {batchId:await batch(g.id,sentOn),productionId:p.id,guideId:g.id};
  }
  const event=(kind:SettlementInput['kind'],amount:string,effectiveOn:string,lines:Array<{receivableId?:string;amount:string;glosaRootId?:string;code?:string}>,patch={})=>settlementSchema.parse({id:randomUUID(),requestId:randomUUID(),contractId:f.contractId,kind,amount,effectiveOn,reference:'DEMONSTRATIVO SINTETICO 105',reason:'Teste sintético multiperíodo',lines:lines.map(line=>({receivableId:f.p.id,...line})),...patch});
  const post=(...args:Parameters<typeof event>)=>saveSettlement(db,actor,event(...args));
  return {...f,batch,additional,event,post};
}
