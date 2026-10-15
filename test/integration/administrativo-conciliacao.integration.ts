import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {before,after,describe,it} from 'node:test';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '@/generated/prisma/client';
import {seedSettlementBatch} from './settlement-fixture';
import {saveBatch,registerValidatedBatchArtifactTx} from '@/modules/administrativo/batch-service';
import {saveGuide} from '@/modules/administrativo/guide-service';
import {saveProduction} from '@/modules/administrativo/production-service';
import {settlementSchema,type SettlementInput} from '@/modules/administrativo/settlement-validation';
import {saveSettlement,receivableBalance,glosaBalance} from '@/modules/administrativo/settlement-service';
import {readSettlementWorkspace} from '@/modules/administrativo/settlement-read';
import {saveBeneficiary} from '@/modules/administrativo/beneficiary-service';
import {deleteDeactivatedUser,linkedCategories} from '@/modules/auth/users/delete';
const url=process.env.INTEGRATION_DATABASE_URL;if(process.env.CI&&!url)throw new Error('Banco obrigatório');
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
const cents=(value:number)=>BigInt(value);
describe('conciliação de operadoras PostgreSQL (#104)',{skip:!url},()=>{
  let db:PrismaClient,other:PrismaClient,actor:string,professional:string;
  before(async()=>{
    db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});other=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});
    actor=(await db.user.create({data:{name:'ADMIN SINTETICO 104',email:randomUUID()+'@example.test',passwordHash:'x',role:'ADMIN'}})).id;
    professional=(await db.user.create({data:{name:'FISIO SINTETICO 104',email:randomUUID()+'@example.test',passwordHash:'x',role:'FISIOTERAPEUTA'}})).id;
  });
  after(async()=>{await db?.$disconnect();await other?.$disconnect();});
  async function sent(){
    const f=await seedSettlementBatch(db,actor,professional);
    const input=f.input();await saveBatch(db,actor,input);
    assert.equal(await db.operatorReceivable.count({where:{batchId:input.id}}),0);
    await saveBatch(db,actor,{...input,operation:'FECHAR',expectedVersion:1,requestId:randomUUID()});
    const b=await db.billingBatch.findUniqueOrThrow({where:{id:input.id}});
    assert.equal(await db.operatorReceivable.count({where:{batchId:b.id}}),0);
    const file=await db.$transaction(tx=>registerValidatedBatchArtifactTx(tx,actor,{id:randomUUID(),requestId:randomUUID(),batchId:b.id,contentDigest:b.contentDigest,bytes:new TextEncoder().encode('ARTEFATO SINTETICO TESTE DOMINIO SEM XSD'),validationReference:'Fixture interna de domínio; não é homologação',purpose:'PRODUCAO'}));
    const send={...input,operation:'ENVIAR' as const,expectedVersion:2,requestId:randomUUID(),artifactId:file.id,sentOn:new Date(today()),protocol:'PROTOCOLO SINTETICO 104',channel:'MANUAL SINTETICO'};
    await saveBatch(db,actor,send);
    const r=await db.operatorReceivable.findUniqueOrThrow({where:{productionId:f.p.id}});
    const entry=(kind:SettlementInput['kind'],amount:string,lines:Array<{receivableId?:string;glosaRootId?:string;amount:string;code?:string}>=[],patch={})=>settlementSchema.parse({id:randomUUID(),requestId:randomUUID(),contractId:f.contractId,kind,amount,effectiveOn:today(),reference:'DEMONSTRATIVO SINTETICO 104',reason:'Conciliação sintética',lines:lines.map(line=>({receivableId:r.id,...line})),...patch});
    return {...f,r,send,entry};
  }
  const balance=(id:string)=>db.$transaction(tx=>receivableBalance(tx,id));
  async function glosa(f:Awaited<ReturnType<typeof sent>>,amount='20,00'){
    const id=await saveSettlement(db,actor,f.entry('GLOSAR',amount,[{amount,code:'SINT-104'}]));
    return db.operatorSettlementLine.findFirstOrThrow({where:{settlementId:id}});
  }
  it('nasce só no primeiro envio; correção de envio não duplica obrigação',async()=>{
    const f=await sent();assert.equal(f.r.amountCents,cents(10000));
    const first=await db.batchSend.findFirstOrThrow({where:{batchId:f.r.batchId,correctsId:null}});
    await saveBatch(db,actor,{...f.send,operation:'CORRIGIR_ENVIO',correctsId:first.id,expectedVersion:3,requestId:randomUUID(),protocol:'PROTOCOLO CORRIGIDO'});
    assert.equal(await db.operatorReceivable.count({where:{batchId:f.r.batchId}}),1);
    assert.equal(await db.charge.count({where:{patientId:f.patientId}}),0);
    await assert.rejects(db.operatorReceivable.update({where:{id:f.r.id},data:{amountCents:1}}));
  });
  it('R$100 = R$60 recebidos + R$20 em análise + R$20 abertos; estorno recompõe apenas R$60',async()=>{
    const f=await sent(),payment=f.entry('RECEBER','60,00',[{amount:'60,00'}]);
    const receipt=await saveSettlement(db,actor,payment);assert.equal(await saveSettlement(other,actor,payment),receipt);
    await glosa(f);
    let b=await balance(f.r.id);assert.deepEqual([b!.billed,b!.received,b!.analysis,b!.open,b!.writtenOff],[10000,6000,2000,2000,0].map(cents));
    await saveSettlement(db,actor,f.entry('ESTORNAR','60,00',[],{reversesId:receipt}));
    b=await balance(f.r.id);assert.deepEqual([b!.received,b!.analysis,b!.open],[0,2000,8000].map(cents));
    const original=await db.operatorSettlement.findUniqueOrThrow({where:{id:receipt},include:{actor:true}});
    assert.equal(original.reference,'DEMONSTRATIVO SINTETICO 104');assert.equal(original.actorId,actor);
    assert.equal(await db.payment.count({where:{charge:{patientId:f.patientId}}}),0);
  });
  it('pagamento de glosa libera a parcela atomicamente, estorno restaura sua origem',async()=>{
    const f=await sent(),g=await glosa(f,'52,37');
    const receipt=await saveSettlement(db,actor,f.entry('RECEBER','40,00',[{amount:'40,00',glosaRootId:g.id}]));
    let b=await balance(f.r.id);assert.deepEqual([b!.received,b!.analysis,b!.open],[4000,1237,4763].map(cents));
    await saveSettlement(db,actor,f.entry('ESTORNAR','40,00',[],{reversesId:receipt}));
    b=await balance(f.r.id);assert.deepEqual([b!.received,b!.analysis,b!.open],[0,5237,4763].map(cents));
  });
  it('baixa definitiva, reabertura e liberação mantêm glosa original e motivo',async()=>{
    const f=await sent(),g=await glosa(f,'52,37');
    await saveSettlement(db,actor,f.entry('DEFINIR','12,37',[{amount:'12,37',glosaRootId:g.id}]));
    await saveSettlement(db,actor,f.entry('RECEBER','40,00',[{amount:'40,00',glosaRootId:g.id}]));
    await assert.rejects(saveSettlement(db,actor,f.entry('RECEBER','1,00',[{amount:'1,00',glosaRootId:g.id}])),/glosa insuficiente/);
    let gstate=await db.$transaction(tx=>glosaBalance(tx,g.id));assert.equal(gstate!.state,'DEFINITIVA');
    await saveSettlement(db,actor,f.entry('REABRIR','12,37',[{amount:'12,37',glosaRootId:g.id}]));
    await saveSettlement(db,actor,f.entry('LIBERAR','12,37',[{amount:'12,37',glosaRootId:g.id}]));
    gstate=await db.$transaction(tx=>glosaBalance(tx,g.id));assert.equal(gstate!.state,'REVERTIDA');
    const b=await balance(f.r.id);assert.deepEqual([b!.received,b!.analysis,b!.writtenOff,b!.open],[4000,0,0,6000].map(cents));
    assert.equal((await db.operatorSettlementLine.findUniqueOrThrow({where:{id:g.id}})).analysisDelta,cents(5237));
  });
  it('substituição é atômica e estorno do substituto não reativa recebimento anterior',async()=>{
    const f=await sent(),first=await saveSettlement(db,actor,f.entry('RECEBER','60,00',[{amount:'60,00'}]));
    const replacement=await saveSettlement(db,actor,f.entry('SUBSTITUIR','50,00',[{amount:'50,00'}],{reversesId:first}));
    assert.equal((await balance(f.r.id))!.received,cents(5000));
    await saveSettlement(db,actor,f.entry('ESTORNAR','50,00',[],{reversesId:replacement}));
    assert.equal((await balance(f.r.id))!.received,cents(0));
    await assert.rejects(saveSettlement(db,actor,f.entry('ESTORNAR','60,00',[],{reversesId:first})),/já estornado/);
    assert.equal(await db.operatorSettlement.count({where:{contractId:f.contractId}}),3);
  });
  it('corridas de alocação e estorno não excedem saldo nem duplicam o crédito',async()=>{
    const f=await sent(),results=await Promise.allSettled([saveSettlement(db,actor,f.entry('RECEBER','60,00',[{amount:'60,00'}])),saveSettlement(other,actor,f.entry('RECEBER','60,00',[{amount:'60,00'}]))]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal((await balance(f.r.id))!.received,cents(6000));
    const id=(results.find(result=>result.status==='fulfilled') as PromiseFulfilledResult<string>).value;
    const reversals=await Promise.allSettled([saveSettlement(db,actor,f.entry('ESTORNAR','60,00',[],{reversesId:id})),saveSettlement(other,actor,f.entry('ESTORNAR','60,00',[],{reversesId:id}))]);
    assert.equal(reversals.filter(result=>result.status==='fulfilled').length,1);assert.equal((await balance(f.r.id))!.received,cents(0));
  });
  it('idempotência/fingerprint e substituição inválida não deixam movimentos parciais',async()=>{
    const f=await sent(),entry=f.entry('RECEBER','60,00',[{amount:'60,00'}]),id=await saveSettlement(db,actor,entry);
    await assert.rejects(saveSettlement(db,actor,{...entry,reference:'OUTRO'}),/reutilizada/);
    await assert.rejects(saveSettlement(db,actor,f.entry('SUBSTITUIR','101,00',[{amount:'101,00'}],{reversesId:id})),/Saldo do item/);
    assert.equal((await balance(f.r.id))!.received,cents(6000));assert.equal(await db.operatorSettlement.count({where:{contractId:f.contractId}}),1);
    await assert.rejects(db.operatorSettlement.update({where:{id},data:{reason:'APAGAR'}}));
    const line=await db.operatorSettlementLine.findFirstOrThrow({where:{settlementId:id}});await assert.rejects(db.operatorSettlementLine.delete({where:{id:line.id}}));
  });
  it('ajuste explícito altera só faturado líquido e recusa redução sobre valores classificados',async()=>{
    const f=await sent();await saveSettlement(db,actor,f.entry('AJUSTAR','-10,00',[{amount:'-10,00'}]));
    await saveSettlement(db,actor,f.entry('RECEBER','90,00',[{amount:'90,00'}]));
    await assert.rejects(saveSettlement(db,actor,f.entry('AJUSTAR','-0,01',[{amount:'-0,01'}])),/Saldo do item/);
    const b=await balance(f.r.id);assert.deepEqual([b!.amountCents,b!.adjustment,b!.billed,b!.received,b!.open],[10000,-1000,9000,9000,0].map(cents));
    assert.equal((await db.billingBatch.findUniqueOrThrow({where:{id:f.r.batchId}})).totalCents,cents(10000));
  });
  it('datas efetivas, glosa de outro item/contrato e valores sem alocação são recusados',async()=>{
    const f=await sent(),foreign=await sent(),g=await glosa(f);
    await assert.rejects(saveSettlement(db,actor,f.entry('RECEBER','1,00',[{amount:'1,00'}],{effectiveOn:'2000-01-01'})),/anteceder/);
    await assert.rejects(saveSettlement(db,actor,f.entry('RECEBER','1,00',[{amount:'1,00'}],{effectiveOn:'2099-01-01'})),/futura/);
    await assert.rejects(saveSettlement(db,actor,f.entry('RECEBER','1,00',[{amount:'1,00',receivableId:foreign.r.id}])),/outro contrato/);
    await assert.rejects(saveSettlement(db,actor,foreign.entry('RECEBER','1,00',[{amount:'1,00',glosaRootId:g.id}])),/não pertence/);
    assert.equal(settlementSchema.safeParse({...f.entry('RECEBER','1,00',[{amount:'1,00'}]),effectiveOn:today(),amount:'2,00',lines:[{receivableId:f.r.id,amount:'1,00'}]}).success,false);
  });
  it('banco recusa overbooking direto, cabeçalho sem alocação e anexação posterior',async()=>{
    const f=await sent();
    const raw=()=>({id:randomUUID(),requestId:randomUUID(),contractId:f.contractId,kind:'RECEBER',effectiveOn:new Date(today()),reference:'SINT',reason:'SINT',amountCents:cents(10001),actorId:actor,fingerprint:'a'.repeat(64)});
    await assert.rejects(db.$transaction(async tx=>{const e=await tx.operatorSettlement.create({data:raw()});await tx.operatorSettlementLine.create({data:{settlementId:e.id,receivableId:f.r.id,receivedDelta:cents(10001)}});}));
    await assert.rejects(db.operatorSettlement.create({data:raw()}));
    const id=await saveSettlement(db,actor,f.entry('RECEBER','1,00',[{amount:'1,00'}]));
    await assert.rejects(db.operatorSettlementLine.create({data:{settlementId:id,receivableId:f.r.id,receivedDelta:cents(1)}}));
    assert.equal((await balance(f.r.id))!.received,cents(100));
  });
  it('posição reconciliada projeta somente operacional e soma independentemente dos eventos',async()=>{
    const f=await sent();await saveSettlement(db,actor,f.entry('RECEBER','60,00',[{amount:'60,00'}]));await glosa(f);
    const result=await readSettlementWorkspace(db,{contractId:f.contractId,page:1,historyPage:1});
    assert.equal(result!.rows.length,1);assert.equal(result!.totals.billed,cents(10000));
    assert.equal(result!.totals.billed,result!.totals.received+result!.totals.open+result!.totals.analysis+result!.totals.writtenOff);
    assert(!JSON.stringify(result,(_key,value)=>typeof value==='bigint'?String(value):value).includes('SEGREDO CLINICO'));
    const all=await db.operatorSettlementLine.findMany({where:{receivableId:f.r.id}});
    assert.equal(all.reduce((sum,line)=>sum+line.receivedDelta,cents(0)),result!.totals.received);
  });
  it('um recebimento pode alocar vários itens e lotes do mesmo contrato',async()=>{
    const f=await sent(),session=await f.session(),p={...f.p,id:randomUUID(),requestId:randomUUID(),expectedVersion:0,sessionId:session.id};await saveProduction(db,actor,p);
    const g={...f.g,id:randomUUID(),requestId:randomUUID(),expectedVersion:0,productionIds:[p.id]};await saveGuide(db,actor,g,true);
    const input={...f.send,id:randomUUID(),requestId:randomUUID(),expectedVersion:0,operation:'SALVAR' as const,guideIds:[g.id],correctsId:null};await saveBatch(db,actor,input);await saveBatch(db,actor,{...input,operation:'FECHAR',expectedVersion:1,requestId:randomUUID()});
    const b=await db.billingBatch.findUniqueOrThrow({where:{id:input.id}}),file=await db.$transaction(tx=>registerValidatedBatchArtifactTx(tx,actor,{id:randomUUID(),requestId:randomUUID(),batchId:b.id,contentDigest:b.contentDigest,bytes:new TextEncoder().encode('FIXTURE MULTILOTE'),validationReference:'Fixture interna sem XSD',purpose:'PRODUCAO'}));
    await saveBatch(db,actor,{...input,operation:'ENVIAR',expectedVersion:2,requestId:randomUUID(),artifactId:file.id});
    await saveSettlement(db,actor,f.entry('RECEBER','150,00',[{amount:'100,00'},{amount:'50,00',receivableId:p.id}]));
    assert.equal((await balance(f.r.id))!.received,cents(10000));assert.equal((await balance(p.id))!.received,cents(5000));
  });
  it('corrida de pagamento/revisão da mesma glosa preserva o saldo da origem',async()=>{
    const f=await sent(),g=await glosa(f,'60,00');
    const results=await Promise.allSettled([saveSettlement(db,actor,f.entry('RECEBER','40,00',[{amount:'40,00',glosaRootId:g.id}])),saveSettlement(other,actor,f.entry('DEFINIR','40,00',[{amount:'40,00',glosaRootId:g.id}]))]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    const b=await balance(f.r.id),state=await db.$transaction(tx=>glosaBalance(tx,g.id));
    assert.equal(state!.analysis,cents(2000));assert.equal(b!.received+b!.analysis+b!.writtenOff+b!.open,b!.billed);
  });
  it('duas instâncias da mesma solicitação retornam o mesmo registro',async()=>{
    const f=await sent(),entry=f.entry('RECEBER','10,00',[{amount:'10,00'}]);
    const [a,b]=await Promise.all([saveSettlement(db,actor,entry),saveSettlement(other,actor,entry)]);
    assert.equal(a,b);assert.equal(await db.operatorSettlement.count({where:{contractId:f.contractId}}),1);assert.equal((await balance(f.r.id))!.received,cents(1000));
  });
  it('banco recusa inversão incompleta e pagamento direto de baixa definitiva',async()=>{
    const f=await sent(),receipt=await saveSettlement(db,actor,f.entry('RECEBER','60,00',[{amount:'60,00'}]));
    const raw={id:randomUUID(),requestId:randomUUID(),contractId:f.contractId,kind:'ESTORNAR',effectiveOn:new Date(today()),reference:'SINT',reason:'SINT',amountCents:cents(6000),actorId:actor,fingerprint:'a'.repeat(64),reversesId:receipt};
    await assert.rejects(db.$transaction(async tx=>{const e=await tx.operatorSettlement.create({data:raw});await tx.operatorSettlementLine.create({data:{settlementId:e.id,receivableId:f.r.id,receivedDelta:cents(-5000),reversalPart:true}});}));
    assert.equal((await balance(f.r.id))!.received,cents(6000));
    const g=await glosa(f,'40,00');await saveSettlement(db,actor,f.entry('DEFINIR','40,00',[{amount:'40,00',glosaRootId:g.id}]));
    await assert.rejects(db.$transaction(async tx=>{const e=await tx.operatorSettlement.create({data:{...raw,id:randomUUID(),requestId:randomUUID(),kind:'RECEBER',amountCents:cents(100),reversesId:null}});await tx.operatorSettlementLine.create({data:{settlementId:e.id,receivableId:f.r.id,glosaRootId:g.id,receivedDelta:cents(100),analysisDelta:cents(-100)}});}));
  });
  it('falha ao gravar substituto desfaz também a inversão do original',async()=>{
    const f=await sent(),receipt=await saveSettlement(db,actor,f.entry('RECEBER','60,00',[{amount:'60,00'}]));
    const broken=db.$extends({query:{operatorSettlementLine:{async createMany(){throw new Error('Falha sintética de persistência');}}}});
    await assert.rejects(saveSettlement(broken as unknown as Pick<PrismaClient,'$transaction'>,actor,f.entry('SUBSTITUIR','50,00',[{amount:'50,00'}],{reversesId:receipt})),/Falha sintética/);
    assert.equal((await balance(f.r.id))!.received,cents(6000));assert.equal(await db.operatorSettlement.count({where:{contractId:f.contractId}}),1);
  });
  it('paginação independente preserva totais integrais, glosas e histórico',async()=>{
    const f=await sent();
    await saveBeneficiary(db,actor,{kind:'item',values:{...f.item,requestId:randomUUID(),expectedVersion:1,authorizedQuantity:100}});
    const ids:string[]=[];
    for(let n=0;n<24;n++){const s=await f.session(),p={...f.p,id:randomUUID(),requestId:randomUUID(),expectedVersion:0,sessionId:s.id,quantity:1};await saveProduction(db,actor,p);ids.push(p.id);}
    const g={...f.g,id:randomUUID(),requestId:randomUUID(),expectedVersion:0,productionIds:ids};await saveGuide(db,actor,g,true);
    const input={...f.send,id:randomUUID(),requestId:randomUUID(),expectedVersion:0,operation:'SALVAR' as const,guideIds:[g.id],correctsId:null};await saveBatch(db,actor,input);await saveBatch(db,actor,{...input,operation:'FECHAR',expectedVersion:1,requestId:randomUUID()});
    const b=await db.billingBatch.findUniqueOrThrow({where:{id:input.id}}),file=await db.$transaction(tx=>registerValidatedBatchArtifactTx(tx,actor,{id:randomUUID(),requestId:randomUUID(),batchId:b.id,contentDigest:b.contentDigest,bytes:new TextEncoder().encode('FIXTURE PAGINACAO'),validationReference:'Fixture interna sem XSD',purpose:'PRODUCAO'}));
    await saveBatch(db,actor,{...input,operation:'ENVIAR',expectedVersion:2,requestId:randomUUID(),artifactId:file.id});
    for(let n=0;n<21;n++){await glosa(f,'0,01');await saveSettlement(db,actor,f.entry('RECEBER','0,01',[{amount:'0,01'}]));}
    const pages=await Promise.all([readSettlementWorkspace(db,{contractId:f.contractId,page:1,historyPage:1}),readSettlementWorkspace(db,{contractId:f.contractId,page:2,historyPage:3})]);
    assert.equal(pages[0]!.rows.length,20);assert.equal(pages[1]!.rows.length,5);assert.equal(pages[0]!.total,cents(25));assert.equal(pages[0]!.totals.billed,cents(130000));
    assert.deepEqual(pages[0]!.totals,pages[1]!.totals);assert.equal(pages[1]!.history.length,2);assert.equal(pages[1]!.historyPages,3);
    const selected=await readSettlementWorkspace(db,{contractId:f.contractId,batchId:f.r.batchId,page:1,historyPage:1,glosaPage:2});
    assert.equal(selected!.totals.billed,cents(10000));assert.equal(selected!.glosas.length,1);assert.equal(selected!.glosaPages,2);assert.equal(selected!.historyPages,3);
  });
  it('banco também serializa duas alocações diretas concorrentes',async()=>{
    const f=await sent();
    const allocate=(client:PrismaClient)=>client.$transaction(async tx=>{const event=await tx.operatorSettlement.create({data:{id:randomUUID(),requestId:randomUUID(),contractId:f.contractId,kind:'RECEBER',effectiveOn:new Date(today()),reference:'SINT',reason:'SINT',amountCents:cents(6000),actorId:actor,fingerprint:'a'.repeat(64)}});await tx.operatorSettlementLine.create({data:{settlementId:event.id,receivableId:f.r.id,receivedDelta:cents(6000)}});});
    const results=await Promise.allSettled([allocate(db),allocate(other)]);assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal((await balance(f.r.id))!.received,cents(6000));
  });
  it('centavos acima de Number.MAX_SAFE_INTEGER permanecem exatos no banco e na consulta',async()=>{
    const f=await sent();
    await saveSettlement(db,actor,f.entry('AJUSTAR','90071992547309,93',[{amount:'90071992547309,93'}]));
    await saveSettlement(db,actor,f.entry('RECEBER','90071992547409,93',[{amount:'90071992547409,93'}]));
    const result=await readSettlementWorkspace(db,{contractId:f.contractId,page:1,historyPage:1});
    assert.equal(result!.totals.billed,BigInt('9007199254740993'));assert.equal(result!.totals.received,BigInt('9007199254740993'));assert.equal(result!.totals.open,cents(0));
  });
  it('autoria financeira própria impede excluir usuário mesmo sem outros vínculos',async()=>{
    const f=await sent(),author=await db.user.create({data:{name:'CONCILIADOR SINTETICO 104',email:randomUUID()+'@example.test',passwordHash:'x',role:'ADMIN'}});
    await saveSettlement(db,author.id,f.entry('RECEBER','1,00',[{amount:'1,00'}]));await db.user.update({where:{id:author.id},data:{active:false}});
    const categories=await db.$transaction(tx=>linkedCategories(tx,author.id));assert.deepEqual(categories,['administrativo']);
    await assert.rejects(deleteDeactivatedUser(db,{actorId:actor,actorRole:'ADMIN',ip:null},author.id),/administrativo/i);
    assert.equal((await db.user.findUniqueOrThrow({where:{id:author.id}})).active,false);
  });
});
