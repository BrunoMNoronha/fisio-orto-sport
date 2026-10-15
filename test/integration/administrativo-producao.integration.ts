import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after,before,describe,it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { seedBeneficiary,beneficiaryMeta } from "./beneficiary-fixture";
import { saveProduction,recordProductionChange,revalidateProductionTx } from "@/modules/administrativo/production-service";
import { productionSchema } from "@/modules/administrativo/production-validation";
import { saveAdministrativeConfig } from "@/modules/administrativo/service";
const url=process.env.INTEGRATION_DATABASE_URL;
if(process.env.CI&&!url)throw new Error("Banco de integração obrigatório");
describe("produção explícita e corridas PostgreSQL (#99)",{skip:!url},()=>{
 let db:PrismaClient,other:PrismaClient,actor:string,professional:string;
 before(async()=>{db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});other=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});
 actor=(await db.user.create({data:{name:'ADMIN SINTETICO 99',email:`adm99-${randomUUID()}@example.test`,passwordHash:'x',role:'ADMIN'}})).id;
 professional=(await db.user.create({data:{name:'FISIO SINTETICO 99',email:`fisio99-${randomUUID()}@example.test`,passwordHash:'x',role:'FISIOTERAPEUTA'}})).id;});
 after(async()=>{await db?.$disconnect();await other?.$disconnect();});
 async function fixture(){
 const f=await seedBeneficiary(db,actor);
 const a=await db.anamnesis.create({data:{patientId:f.patientId,authorId:actor,authorNameSnapshot:'ADMIN SINTETICO',assessmentDate:new Date('2026-01-01'),chiefComplaint:'DADO CLINICO SECRETO'}});
 const assessment=await db.assessment.create({data:{patientId:f.patientId,anamnesisId:a.id,authorId:actor,authorNameSnapshot:'ADMIN SINTETICO',assessmentDate:new Date('2026-01-01'),diagnosis:'DADO CLINICO SECRETO'}});
 const plan=await db.therapyPlan.create({data:{patientId:f.patientId,assessmentId:assessment.id,assessmentVersion:1,authorId:actor,authorNameSnapshot:'ADMIN SINTETICO',revisions:{create:{number:1,kind:'INICIAL',planDate:new Date('2026-01-01'),goals:'SINTETICO',conduct:'SINTETICO',authorId:actor,authorNameSnapshot:'ADMIN SINTETICO'}}},include:{revisions:true}});
 const session=async()=>db.treatmentSession.create({data:{patientId:f.patientId,planId:plan.id,planRevisionId:plan.revisions[0].id,occurredAt:new Date('2026-01-16T02:30:00Z'),professionalId:professional,professionalNameSnapshot:'FISIO SINTETICO',evolution:'DADO CLINICO SECRETO',idempotencyKey:randomUUID(),authorId:actor,authorNameSnapshot:'ADMIN SINTETICO'}});
 const s=await session();
 const tariff={...beneficiaryMeta(),active:true,procedureId:f.procedureId,amount:5237,startsOn:new Date('2026-01-01'),endsOn:null};
 await saveAdministrativeConfig(db,actor,{kind:'tariff',values:tariff});
 const input=(patch={})=>productionSchema.parse({...beneficiaryMeta(),sessionId:s.id,coverageId:f.coverage.id,procedureId:f.procedureId,quantity:'2',endTime:'',authorizationItemId:f.item.id,operation:'CONFERIR',...patch});
 return {...f,s,session,input,tariff};
 }
 it('sessão sem agenda não cria produção ou cobrança; conferência captura centavos, fuso e reenvio',async()=>{
 const f=await fixture();assert.equal(await db.productionItem.count({where:{sessionId:f.s.id}}),0);assert.equal(await db.charge.count({where:{patientId:f.patientId}}),0);
 const input=f.input();await saveProduction(db,actor,input);await saveProduction(db,actor,input);
 const item=await db.productionItem.findUniqueOrThrow({where:{id:input.id}});assert.equal(item.state,'APTO');assert.equal(item.amountCents,BigInt(10474));assert.equal(item.executionOn.toISOString().slice(0,10),'2026-01-15');
 assert.equal(await db.authorizationUse.count({where:{itemId:f.item.id}}),1);assert.equal(await db.productionChange.count({where:{itemId:input.id}}),1);assert.equal(JSON.stringify(item.snapshot).includes('DADO CLINICO'),false);
 assert.equal((await db.$transaction(tx=>revalidateProductionTx(tx,input.id))).status,'OK');
 await assert.rejects(saveProduction(db,actor,{...input,quantity:3}),/outros dados/);
 });
 it('duas conferências no último saldo nunca excedem dez unidades',async()=>{
 const f=await fixture(),second=await f.session();const inputs=[f.input({quantity:7}),f.input({quantity:7,sessionId:second.id})];
 await Promise.all(inputs.map((v,i)=>saveProduction(i?other:db,actor,v)));
 const rows=await db.productionItem.findMany({where:{id:{in:inputs.map(x=>x.id)}}});assert.equal(rows.filter(r=>r.state==='APTO').length,1);assert.equal(rows.filter(r=>r.pendingReason.includes('saldo suficiente')).length,1);
 assert.equal((await db.authorizationUse.aggregate({where:{itemId:f.item.id},_sum:{quantity:true}}))._sum.quantity,7);
 });
 it('unicidade de negócio impede dupla produção mas permite outro procedimento',async()=>{
 const f=await fixture(),inputs=[f.input(),f.input()];const results=await Promise.allSettled(inputs.map((v,i)=>saveProduction(i?other:db,actor,v)));assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const proc={...beneficiaryMeta(),active:true,contractId:f.contractId,tableCode:'00',code:'00002',name:'SEGUNDO SINTETICO'};await saveAdministrativeConfig(db,actor,{kind:'procedure',values:proc});
 await saveProduction(db,actor,f.input({procedureId:proc.id,operation:'PREPARAR',authorizationItemId:''}));assert.equal(await db.productionItem.count({where:{sessionId:f.s.id}}),2);
 });
 it('correção clínica devolve consumo e exige reconferência, inclusive SQL direto',async()=>{
 const f=await fixture(),input=f.input();await saveProduction(db,actor,input);
 await assert.rejects(db.treatmentSession.update({where:{id:f.s.id},data:{occurredAt:new Date('2026-01-17T02:30:00Z')}}));
 await db.$transaction(async tx=>{await tx.treatmentSession.update({where:{id:f.s.id},data:{occurredAt:new Date('2026-01-17T02:30:00Z'),version:{increment:1}}});await tx.treatmentSessionChange.create({data:{sessionId:f.s.id,version:2,field:'occurredAt',reason:'Correção sintética',editorId:actor,editorNameSnapshot:'ADMIN SINTETICO'}});});
 const item=await db.productionItem.findUniqueOrThrow({where:{id:input.id}});assert.equal(item.state,'PENDENTE');assert.equal(item.useId,null);assert.equal((await db.authorizationUse.aggregate({where:{itemId:f.item.id},_sum:{quantity:true}}))._sum.quantity,0);
 await saveProduction(db,actor,{...input,expectedVersion:2,requestId:randomUUID()});assert.equal((await db.productionItem.findUniqueOrThrow({where:{id:input.id}})).state,'APTO');
 });
 it('invalidação versus conferência nunca deixa consumo em sessão inválida',async()=>{
 const f=await fixture(),input=f.input();await Promise.allSettled([saveProduction(db,actor,input),other.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Patient" WHERE id=${f.patientId} FOR UPDATE`;await tx.treatmentSession.update({where:{id:f.s.id},data:{status:'INVALIDADO',invalidatedAt:new Date(),invalidatedById:actor,invalidatedByNameSnapshot:'ADMIN SINTETICO',invalidationReason:'Teste',version:{increment:1}}});})]);
 assert.equal((await db.treatmentSession.findUniqueOrThrow({where:{id:f.s.id}})).status,'INVALIDADO');assert.equal((await db.authorizationUse.aggregate({where:{itemId:f.item.id},_sum:{quantity:true}}))._sum.quantity??0,0);
 assert.equal(await db.productionItem.count({where:{sessionId:f.s.id,state:'APTO'}}),0);
 });
 it('snapshot fechado é preservado e recebe pendência após correção clínica',async()=>{
 const f=await fixture(),input=f.input();await saveProduction(db,actor,input);
 await db.$transaction(async tx=>{await tx.productionItem.update({where:{id:input.id},data:{state:'FECHADO',version:{increment:1}}});await recordProductionChange(tx,input.id,actor,'Fechamento sintético para contrato futuro',randomUUID(),'a'.repeat(64));});
 const before=await db.productionItem.findUniqueOrThrow({where:{id:input.id}});
 await db.$transaction(async tx=>{await tx.treatmentSession.update({where:{id:f.s.id},data:{version:{increment:1},evolution:'CORRECAO CLINICA SINTETICA'}});await tx.treatmentSessionChange.create({data:{sessionId:f.s.id,version:2,field:'evolution',reason:'Correção sintética',editorId:actor,editorNameSnapshot:'ADMIN SINTETICO'}});});
 const after=await db.productionItem.findUniqueOrThrow({where:{id:input.id}});assert.deepEqual(after.snapshot,before.snapshot);assert.equal(after.state,'FECHADO');assert.equal(after.adjustmentPending,true);assert.equal(after.useId,before.useId);
 await assert.rejects(db.productionItem.update({where:{id:input.id},data:{quantity:4,version:{increment:1}}}));
 });
 it('consumo de produção não pode ser devolvido isoladamente ou deixar item apto sem saldo',async()=>{
 const f=await fixture(),input=f.input({quantity:10});await saveProduction(db,actor,input);
 assert.equal((await db.$transaction(tx=>revalidateProductionTx(tx,input.id))).status,'OK');
 const p=await db.productionItem.findUniqueOrThrow({where:{id:input.id}});
 await assert.rejects(db.$transaction(async tx=>{const {returnAuthorizationTx}=await import('@/modules/administrativo/beneficiary-service');await returnAuthorizationTx(tx,actor,{useId:p.useId!,requestId:randomUUID(),reason:'Devolução isolada indevida'});}));
 });
 it('edição de tarifa versus conferência captura uma versão inteira, sem misturar valores',async()=>{
 const f=await fixture(),input=f.input();await Promise.all([saveProduction(db,actor,input),saveAdministrativeConfig(other,actor,{kind:'tariff',values:{...f.tariff,expectedVersion:1,requestId:randomUUID(),amount:9999}})]);
 const p=await db.productionItem.findUniqueOrThrow({where:{id:input.id}});const snap=p.snapshot as {tariff:{amountCents:number;tariffVersion:number}};
 assert.ok([5237,9999].includes(snap.tariff.amountCents));assert.equal(p.amountCents,BigInt(2)*BigInt(snap.tariff.amountCents));assert.equal(snap.tariff.tariffVersion,snap.tariff.amountCents===5237?1:2);
 });
 it('tarifa editada não altera snapshot apto; devolução é integral e motivada',async()=>{
 const f=await fixture(),input=f.input();await saveProduction(db,actor,input);const before=await db.productionItem.findUniqueOrThrow({where:{id:input.id}});
 await saveAdministrativeConfig(db,actor,{kind:'tariff',values:{...f.tariff,expectedVersion:1,requestId:randomUUID(),amount:9999}});
 assert.deepEqual((await db.productionItem.findUniqueOrThrow({where:{id:input.id}})).snapshot,before.snapshot);
 await saveProduction(db,actor,{...input,operation:'DEVOLVER',expectedVersion:1,requestId:randomUUID()});assert.equal((await db.authorizationUse.aggregate({where:{itemId:f.item.id},_sum:{quantity:true}}))._sum.quantity,0);
 });
});
