import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after,before,describe,it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { saveBeneficiary,saveAuthorizationRule,consumeAuthorization,returnAuthorization,consumeAuthorizationTx } from "@/modules/administrativo/beneficiary-service";
import { readEligibility } from "@/modules/administrativo/eligibility";
import { coverageSchema,authorizationSchema,authorizationItemSchema } from "@/modules/administrativo/beneficiary-validation";
import { seedBeneficiary,beneficiaryMeta } from "./beneficiary-fixture";
const url=process.env.INTEGRATION_DATABASE_URL;
if(process.env.CI&&!url) throw new Error("INTEGRATION_DATABASE_URL é obrigatória na CI.");
describe("coberturas e autorizações PostgreSQL (#98)",{skip:!url&&"INTEGRATION_DATABASE_URL não definida"},()=>{
  let db:PrismaClient,writer:PrismaClient,actor:string;
  before(async()=>{db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});writer=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});
    actor=(await db.user.create({data:{name:"ADMIN SINTETICO ADM02",email:`adm02-${randomUUID()}@example.test`,passwordHash:"x",role:"ADMIN"}})).id;});
  after(async()=>{await db?.$disconnect();await writer?.$disconnect();});
  const use=(itemId:string,patch={})=>({itemId,requestId:randomUUID(),sourceKey:randomUUID(),quantity:2,executionOn:"2026-01-15",reason:"Conferência sintética",...patch});
  it("carteiras distintas preservam legado e histórico; validade usa execução retroativa inclusiva",async()=>{
    const f=await seedBeneficiary(db,actor);
    const second=coverageSchema.parse({...beneficiaryMeta(),patientId:f.patientId,contractId:f.contractId,beneficiaryName:"OUTRO BENEFICIARIO",cardNumber:"000999",planName:"NOVO",
      startsOn:"2028-01-01",endsOn:""});
    await saveBeneficiary(db,actor,{kind:"coverage",values:second});
    assert.equal((await db.patient.findUniqueOrThrow({where:{id:f.patientId}})).healthInsuranceCard,"000LEGADO");
    assert.equal((await db.beneficiaryCoverage.findUniqueOrThrow({where:{id:f.coverage.id}})).cardNumber,"000123");
    for(const executionOn of ["2026-01-01","2026-01-31"]){
      const r=await readEligibility(db,{patientId:f.patientId,coverageId:f.coverage.id,procedureId:f.procedureId,itemId:f.item.id,executionOn,quantity:1});
      assert.equal(r.status,"APTA");
    }
    assert.equal((await readEligibility(db,{patientId:f.patientId,coverageId:f.coverage.id,procedureId:f.procedureId,itemId:f.item.id,executionOn:"2026-02-01",quantity:1})).status,"AUTORIZACAO_FORA_DA_VIGENCIA");
    const consumed=await consumeAuthorization(db,actor,use(f.item.id,{executionOn:"2026-01-31"}));
    assert.equal(consumed.executionOn.toISOString().slice(0,10),"2026-01-31");
  });
  it("saldo separa autorizado, consumido e disponível e não usa o plano clínico",async()=>{
    const f=await seedBeneficiary(db,actor); await consumeAuthorization(db,actor,use(f.item.id,{quantity:3}));
    const result=await readEligibility(db,{patientId:f.patientId,coverageId:f.coverage.id,procedureId:f.procedureId,itemId:f.item.id,executionOn:"2026-01-10",quantity:7});
    assert.equal(result.status,"APTA"); if(result.status==="APTA") assert.deepEqual(result.balance,{authorized:10,consumed:3,available:7});
    const fail=await readEligibility(db,{patientId:f.patientId,coverageId:f.coverage.id,procedureId:f.procedureId,itemId:f.item.id,executionOn:"2026-01-10",quantity:8});
    assert.equal(fail.status,"SALDO_INSUFICIENTE");
  });
  it("consumos concorrentes não ultrapassam saldo e reenvio não duplica efeito",async()=>{
    const f=await seedBeneficiary(db,actor);
    const results=await Promise.allSettled([db,writer].map(client=>consumeAuthorization(client,actor,use(f.item.id,{quantity:7}))));
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
    assert.equal((await db.authorizationUse.aggregate({where:{itemId:f.item.id},_sum:{quantity:true}}))._sum.quantity,7);
    const input=use(f.item.id,{quantity:3});
    const [a,b]=await Promise.all([db,writer].map(client=>consumeAuthorization(client,actor,input)));
    assert.equal(a.id,b.id);
    await assert.rejects(consumeAuthorization(db,actor,{...input,quantity:1}),/outros dados/);
  });
  it("cancelar/corrigir com consumo não libera saldo; devolução explícita mantém snapshot",async()=>{
    const f=await seedBeneficiary(db,actor),record=await consumeAuthorization(db,actor,use(f.item.id,{quantity:4}));
    await assert.rejects(saveBeneficiary(db,actor,{kind:"authorization",values:{...f.authorization,active:false,expectedVersion:1,requestId:randomUUID()}}),/consumo vigente/);
    await assert.rejects(saveBeneficiary(db,actor,{kind:"coverage",values:{...f.coverage,cardNumber:"999",expectedVersion:1,requestId:randomUUID()}}),/consumo vigente/);
    await assert.rejects(saveBeneficiary(db,actor,{kind:"item",values:{...f.item,authorizedQuantity:3,expectedVersion:1,requestId:randomUUID()}}),/consumo vigente/);
    await saveBeneficiary(db,actor,{kind:"item",values:{...f.item,authorizedQuantity:12,expectedVersion:1,requestId:randomUUID()}});
    const returned=await returnAuthorization(db,actor,{useId:record.id,requestId:randomUUID(),reason:"Correção da produção fictícia"});
    assert.equal(returned.quantity,-4);assert.deepEqual(returned.snapshot,record.snapshot);
    await assert.rejects(returnAuthorization(db,actor,{useId:record.id,requestId:randomUUID(),reason:"Duplicada"}));
    await saveBeneficiary(db,actor,{kind:"authorization",values:{...f.authorization,active:false,expectedVersion:1,requestId:randomUUID()}});
    await saveBeneficiary(db,actor,{kind:"coverage",values:{...f.coverage,cardNumber:"000999",expectedVersion:1,requestId:randomUUID()}});
    assert.equal((await db.beneficiaryCoverage.findUniqueOrThrow({where:{id:f.coverage.id}})).cardNumber,"000999");
    assert.equal(await db.authorizationUse.count({where:{itemId:f.item.id}}),2);
    const historical=record.snapshot as {cardNumber:string;authorizationNumber:string};
    assert.equal(historical.cardNumber,"000123");assert.equal(historical.authorizationNumber,"000AUTH01");
    await assert.rejects(db.authorizationUse.update({where:{id:record.id},data:{quantity:1}}));
    await assert.rejects(db.authorizationUse.delete({where:{id:record.id}}));
  });
  it("mesma autorização não pode receber procedimento de outro contrato nem cobertura incompatível",async()=>{
    const a=await seedBeneficiary(db,actor),b=await seedBeneficiary(db,actor);
    await assert.rejects(saveBeneficiary(db,actor,{kind:"authorization",values:authorizationSchema.parse({...beneficiaryMeta(),coverageId:a.coverage.id,contractId:b.contractId,
      number:"FORJADA",accessCode:"",issuedOn:"2026-01-01",startsOn:"2026-01-01",endsOn:"2026-01-31"})}),/incompatíveis/);
    await assert.rejects(saveBeneficiary(db,actor,{kind:"item",values:authorizationItemSchema.parse({...beneficiaryMeta(),authorizationId:a.authorization.id,contractId:a.contractId,procedureId:b.procedureId,authorizedQuantity:1})}),/mesmo contrato/);
    await assert.rejects(db.authorizationItem.create({data:{id:randomUUID(),authorizationId:a.authorization.id,contractId:b.contractId,procedureId:b.procedureId,authorizedQuantity:1,createdById:actor,updatedById:actor}}));
    assert.equal((await readEligibility(db,{patientId:b.patientId,coverageId:a.coverage.id,procedureId:a.procedureId,itemId:a.item.id,executionOn:"2026-01-01",quantity:1})).status,"COBERTURA_INCOMPATIVEL");
  });
  it("regra desconhecida é pendência; dispensa precisa de versão explícita do administrador",async()=>{
    const f=await seedBeneficiary(db,actor);
    await saveAuthorizationRule(db,actor,{...f.rule,id:randomUUID(),expectedVersion:1,mode:"PENDENTE",requestId:randomUUID()});
    const input={patientId:f.patientId,coverageId:f.coverage.id,procedureId:f.procedureId,executionOn:"2026-01-01",quantity:1};
    assert.equal((await readEligibility(db,input)).status,"REGRA_PENDENTE");
    await saveAuthorizationRule(db,actor,{...f.rule,id:randomUUID(),expectedVersion:2,mode:"DISPENSADA",requestId:randomUUID()});
    assert.equal((await readEligibility(db,input)).status,"DISPENSADA");
    await assert.rejects(consumeAuthorization(db,actor,use(f.item.id)),/pendente ou dispensada/);
    assert.equal(await db.procedureAuthorizationRule.count({where:{procedureId:f.procedureId}}),3);
    await assert.rejects(db.procedureAuthorizationRule.deleteMany({where:{procedureId:f.procedureId}}));
  });
  it("edição concorrente mantém versão; replay original funciona após correção",async()=>{
    const f=await seedBeneficiary(db,actor);
    const edits=await Promise.allSettled([db,writer].map((client,i)=>saveBeneficiary(client,actor,{kind:"coverage",values:{...f.coverage,cardNumber:`000${i}`,expectedVersion:1,requestId:randomUUID()}})));
    assert.equal(edits.filter(r=>r.status==="fulfilled").length,1);
    assert.equal(await saveBeneficiary(db,actor,{kind:"coverage",values:f.coverage}),f.coverage.id);
    assert.equal(await db.beneficiaryChange.count({where:{coverageId:f.coverage.id}}),2);
    await assert.rejects(db.beneficiaryCoverage.update({where:{id:f.coverage.id},data:{version:{increment:1},cardNumber:"SEM HISTORICO"}}));
    await assert.rejects(db.beneficiaryCoverage.delete({where:{id:f.coverage.id}}));
  });
  it("consumo e registro de produção podem compartilhar transação; falha reverte ambos",async()=>{
    const f=await seedBeneficiary(db,actor);
    await assert.rejects(db.$transaction(async tx=>{await consumeAuthorizationTx(tx,actor,use(f.item.id));throw new Error("Falha simulada no item de produção");}),/Falha simulada/);
    assert.equal(await db.authorizationUse.count({where:{itemId:f.item.id}}),0);
    await db.patient.update({where:{id:f.patientId},data:{status:"INATIVO"}});
    await assert.rejects(consumeAuthorization(db,actor,use(f.item.id)),/indisponível/);
  });
  it("SQL direto não supera saldo e devolução forjada não é aceita",async()=>{
    const f=await seedBeneficiary(db,actor);
    const direct=(client:PrismaClient)=>client.authorizationUse.create({data:{id:randomUUID(),itemId:f.item.id,quantity:8,executionOn:new Date("2026-01-15"),sourceKey:randomUUID(),
      requestId:randomUUID(),fingerprint:"a".repeat(64),snapshot:{},reason:"SQL sintético",actorId:actor}});
    const results=await Promise.allSettled([direct(db),direct(writer)]);
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
    const original=await db.authorizationUse.findFirstOrThrow({where:{itemId:f.item.id}});
    await assert.rejects(db.authorizationUse.create({data:{id:randomUUID(),itemId:f.item.id,quantity:-1,executionOn:original.executionOn,reversesId:original.id,
      sourceKey:randomUUID(),requestId:randomUUID(),fingerprint:"b".repeat(64),snapshot:{},reason:"Forjada",actorId:actor}}));
  });
  it("cancelamento concorrente com consumo nunca cancela uma autorização com saldo usado",async()=>{
    const f=await seedBeneficiary(db,actor);
    const results=await Promise.allSettled([
      consumeAuthorization(db,actor,use(f.item.id)),
      saveBeneficiary(writer,actor,{kind:"authorization",values:{...f.authorization,active:false,expectedVersion:1,requestId:randomUUID()}}),
    ]);
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
    const state=await db.benefitAuthorization.findUniqueOrThrow({where:{id:f.authorization.id}});
    const used=(await db.authorizationUse.aggregate({where:{itemId:f.item.id},_sum:{quantity:true}}))._sum.quantity??0;
    assert.ok(state.active||used===0);
  });
});
