import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {before,after,describe,it} from 'node:test';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient,type Prisma} from '@/generated/prisma/client';
import {seedFinancialReport} from './financial-report-fixture';
import {readFinancialReport,FINANCIAL_AMOUNTS,type FinancialReport} from '@/modules/administrativo/financial-report-read';
import {parseFinancialReportFilters,type FinancialReportKind} from '@/modules/administrativo/financial-report-validation';
import {financialReportCsv} from '@/modules/administrativo/financial-report-csv';
import {saveAdministrativeConfig} from '@/modules/administrativo/service';
import {saveBeneficiary} from '@/modules/administrativo/beneficiary-service';
import {saveBatch} from '@/modules/administrativo/batch-service';
const url=process.env.INTEGRATION_DATABASE_URL;if(process.env.CI&&!url)throw new Error('Banco obrigatório');
const n=(value:number)=>BigInt(value);
describe('relatórios financeiros de operadoras PostgreSQL (#105)',{skip:!url},()=>{
  let db:PrismaClient,actor:string,professional:string;
  before(async()=>{db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});actor=(await db.user.create({data:{name:'ADMIN SINTETICO 105',email:randomUUID()+'@example.test',passwordHash:'x',role:'ADMIN'}})).id;professional=(await db.user.create({data:{name:'FISIO SINTETICO 105',email:randomUUID()+'@example.test',passwordHash:'x',role:'FISIOTERAPEUTA'}})).id;});
  after(async()=>{await db?.$disconnect();});
  const filters=(kind:FinancialReportKind,patch:Record<string,string>={})=>{const parsed=parseFinancialReportFilters(kind,patch);assert(parsed.filters,parsed.error??'filtro inválido');return parsed.filters;};
  async function fixture(){const f=await seedFinancialReport(db,actor,professional),batchId=await f.batch();return {...f,batchId};}
  const report=(f:{contractId:string},kind:FinancialReportKind='conciliacao',patch:Record<string,string>={},mode:'page'|'all'='page')=>readFinancialReport(db,kind,filters(kind,{contractId:f.contractId,...patch}),mode);
  function reconciles(r:FinancialReport){for(const t of [...r.items,...r.totals]){assert.equal(t.billed,t.original+t.adjustment);assert.equal(t.billed,t.received+t.open+t.analysis+t.writtenOff);}if(r.items.length===r.total)for(const key of FINANCIAL_AMOUNTS)assert.equal(r.items.reduce((sum,row)=>sum+row[key],n(0)),r.totals.reduce((sum,row)=>sum+row[key],n(0)),key);}
  it('R$100 concilia com múltiplos pagamentos e glosas sem fanout no item ou lote',async()=>{
    const f=await fixture();await f.post('RECEBER','30,00','2026-02-02',[{amount:'30,00'}]);await f.post('RECEBER','30,00','2026-03-02',[{amount:'30,00'}]);await f.post('GLOSAR','10,00','2026-02-03',[{amount:'10,00',code:'SINT-A'}]);await f.post('GLOSAR','10,00','2026-03-03',[{amount:'10,00',code:'SINT-B'}]);
    for(const kind of ['conciliacao','faturamento'] as const){const r=await report(f,kind);assert.equal(r.total,1);assert.deepEqual([r.totals[0].billed,r.totals[0].received,r.totals[0].analysis,r.totals[0].open],[10000,6000,2000,2000].map(n));reconciles(r);}
  });
  it('um recebimento alocado entre lotes é somado pelas parcelas, nunca pelo cabeçalho repetido',async()=>{
    const f=await fixture(),second=await f.additional();
    await f.post('RECEBER','120,00','2026-02-02',[{amount:'100,00'},{receivableId:second.productionId,amount:'20,00'}]);
    for(const kind of ['faturamento','conciliacao'] as const){const r=await report(f,kind,kind==='conciliacao'?{axis:'recebimento',start:'2026-02-02',end:'2026-02-02'}:{},'all');assert.equal(r.total,2);assert.deepEqual([r.totals[0].original,r.totals[0].received,r.totals[0].open],[15000,12000,3000].map(n));reconciles(r);}
  });
  it('execução, fechamento em São Paulo e envio original são eixos inclusivos independentes',async()=>{
    const f=await fixture();
    assert.equal((await report(f,'conciliacao',{axis:'execucao',start:'2026-01-15',end:'2026-01-15'})).total,1);
    assert.equal((await report(f,'conciliacao',{axis:'execucao',start:'2026-01-16'})).total,0);
    assert.equal((await report(f,'faturamento',{axis:'fechamento',start:'2026-01-31',end:'2026-01-31'})).total,1);
    assert.equal((await report(f,'faturamento',{axis:'fechamento',start:'2026-02-01'})).total,0);
    assert.equal((await report(f,'faturamento',{axis:'envio',start:'2026-02-01',end:'2026-02-01'})).total,1);
    const first=await db.batchSend.findFirstOrThrow({where:{batchId:f.batchId,correctsId:null}}),b=await db.billingBatch.findUniqueOrThrow({where:{id:f.batchId}});
    await saveBatch(db,actor,{...f.input(),id:b.id,operation:'CORRIGIR_ENVIO',expectedVersion:b.version,artifactId:first.artifactId,sentOn:new Date('2026-03-01'),protocol:'CORRECAO SINTETICA',channel:'MANUAL',correctsId:first.id});
    assert.equal((await report(f,'faturamento',{axis:'envio',start:'2026-03-01'})).total,0);
    assert.equal((await report(f,'faturamento',{axis:'envio',end:'2026-02-01'})).total,1);
  });
  it('lote fechado é preparação, sem obrigação nem faturamento antes do envio',async()=>{
    const f=await seedFinancialReport(db,actor,professional);await f.batch(f.g.id,null);
    const closed=await report(f,'faturamento',{axis:'fechamento'});assert.equal(closed.total,1);assert.equal(closed.items[0].batchValue,n(10000));assert.equal(closed.items[0].billed,n(0));reconciles(closed);
    assert.equal((await report(f,'faturamento',{axis:'envio'})).total,0);assert.equal((await report(f)).total,0);
  });
  it('recebimento seleciona o mesmo recorte, mostra período separado e exclui originais estornados',async()=>{
    const f=await fixture(),first=await f.post('RECEBER','30,00','2026-02-02',[{amount:'30,00'}]);await f.post('RECEBER','30,00','2026-03-02',[{amount:'30,00'}]);await f.post('GLOSAR','20,00','2026-04-03',[{amount:'20,00',code:'SINT'}]);
    const selected=await report(f,'conciliacao',{axis:'recebimento',start:'2026-02-02',end:'2026-02-02'});assert.equal(selected.total,1);assert.equal(selected.items[0].periodReceived,n(3000));assert.equal(selected.items[0].received,n(6000));assert.equal(selected.items[0].analysis,n(2000));reconciles(selected);
    await f.post('ESTORNAR','30,00','2026-04-02',[],{reversesId:first});assert.equal((await report(f,'conciliacao',{axis:'recebimento',start:'2026-02-01',end:'2026-02-28'})).total,0);
    const march=await report(f,'conciliacao',{axis:'recebimento',start:'2026-03-01',end:'2026-03-31'});assert.equal(march.items[0].periodReceived,n(3000));assert.equal(march.items[0].received,n(3000));reconciles(march);
  });
  it('glosa original define o recorte mesmo após liberação/baixa; período não é saldo',async()=>{
    const f=await fixture(),eid=await f.post('GLOSAR','20,00','2026-02-03',[{amount:'20,00',code:'SINT-A'}]);const root=await db.operatorSettlementLine.findFirstOrThrow({where:{settlementId:eid}});
    await f.post('GLOSAR','10,00','2026-03-03',[{amount:'10,00',code:'SINT-B'}]);await f.post('DEFINIR','5,00','2026-04-03',[{amount:'5,00',glosaRootId:root.id}]);await f.post('LIBERAR','15,00','2026-04-03',[{amount:'15,00',glosaRootId:root.id}]);
    const r=await report(f,'conciliacao',{axis:'glosa',start:'2026-02-03',end:'2026-02-03'});assert.equal(r.total,1);assert.deepEqual([r.items[0].periodGlosed,r.items[0].analysis,r.items[0].writtenOff],[2000,1000,500].map(n));reconciles(r);
    assert.equal((await report(f,'conciliacao',{axis:'glosa',start:'2026-04-03'})).total,0);
  });
  it('substituição, estorno do substituto e ajustes mantêm totais exatos atuais',async()=>{
    const f=await fixture(),first=await f.post('RECEBER','60,00','2026-02-02',[{amount:'60,00'}]);const replacement=await f.post('SUBSTITUIR','50,00','2026-03-02',[{amount:'50,00'}],{reversesId:first});await f.post('AJUSTAR','-10,00','2026-03-03',[{amount:'-10,00'}]);
    assert.equal((await report(f,'conciliacao',{axis:'recebimento',end:'2026-02-28'})).total,0);
    let r=await report(f,'conciliacao',{axis:'recebimento',start:'2026-03-02',end:'2026-03-02'});assert.deepEqual([r.items[0].original,r.items[0].adjustment,r.items[0].billed,r.items[0].received,r.items[0].open],[10000,-1000,9000,5000,4000].map(n));reconciles(r);
    await f.post('ESTORNAR','50,00','2026-04-02',[],{reversesId:replacement});r=await report(f);assert.equal(r.items[0].received,n(0));assert.equal(r.items[0].open,n(9000));reconciles(r);
  });
  it('várias operadoras ficam separadas; filtros de guia/item e cadastro inativo preservam histórico',async()=>{
    const f=await fixture(),foreign=await fixture();await f.post('RECEBER','60,00','2026-02-02',[{amount:'60,00'}]);
    const all=await readFinancialReport(db,'conciliacao',filters('conciliacao',{axis:'envio'}));const ours=all.totals.filter(t=>[f.contractId,foreign.contractId].includes(t.contractId));assert.equal(ours.length,2);assert.equal(ours.find(t=>t.contractId===f.contractId)!.received,n(6000));assert.equal(ours.find(t=>t.contractId===foreign.contractId)!.received,n(0));
    const c=await db.operatorContract.findUniqueOrThrow({where:{id:f.contractId}});await db.patient.update({where:{id:f.patientId},data:{status:'INATIVO'}});await saveAdministrativeConfig(db,actor,{kind:'contract',values:{...c,id:c.id,requestId:randomUUID(),expectedVersion:c.version,reason:'Inativação sintética',active:false}});
    const selected=await report(f,'conciliacao',{patientId:f.patientId,guideId:f.g.id,procedureId:f.procedureId,professionalId:professional,balance:'COM_RECEBIDO'});assert.equal(selected.total,1);assert.equal(selected.items[0].received,n(6000));assert.equal((await report(f,'conciliacao',{operatorId:(await db.operatorContract.findUniqueOrThrow({where:{id:foreign.contractId}})).operatorId})).total,0);
    assert(!JSON.stringify(selected,(_key,value)=>typeof value==='bigint'?String(value):value).includes('SEGREDO CLINICO'));assert(!JSON.stringify(selected,(_key,value)=>typeof value==='bigint'?String(value):value).includes('000SENHA'));
  });
  it('25 lotes/itens em duas páginas exportam integralmente, aplicam menor limite e recusam truncamento',async()=>{
    const f=await fixture();await saveBeneficiary(db,actor,{kind:'item',values:{...f.item,requestId:randomUUID(),expectedVersion:1,authorizedQuantity:100}});
    for(let i=0;i<24;i++)await f.additional();
    for(const kind of ['faturamento','conciliacao'] as const){const first=await report(f,kind),second=await report(f,kind,{page:'2'}),full=await report(f,kind,{},'all');assert.equal(first.items.length,20);assert.equal(second.items.length,5);assert.equal(full.items.length,25);assert.equal(full.totals[0].original,n(130000));reconciles(full);assert.equal(financialReportCsv(full).split('\r\n').filter(line=>line.startsWith('"ITEM";')).length,25);assert.deepEqual(first.totals,second.totals);}
    const c=await db.operatorContract.findUniqueOrThrow({where:{id:f.contractId}});await saveAdministrativeConfig(db,actor,{kind:'contract',values:{...c,id:c.id,requestId:randomUUID(),expectedVersion:c.version,reason:'Limite sintético',active:true,maxExportRows:1}});
    for(const kind of ['faturamento','conciliacao'] as const){const r=await report(f,kind,{},'all');assert.match(r.error!,/excede/);assert.equal(r.items.length,0);assert.throws(()=>financialReportCsv(r));assert.equal((await report(f,kind)).total,25);}
    for(const kind of ['faturamento','conciliacao'] as const){const mixed=await readFinancialReport(db,kind,filters(kind), 'all');assert.equal(mixed.limit,1);assert(mixed.error);assert.equal(mixed.items.length,0);}
  });
  it('valores acima de Number.MAX_SAFE_INTEGER e CSV preservam centavos',async()=>{
    const f=await fixture();await f.post('AJUSTAR','90071992547309,93','2026-02-02',[{amount:'90071992547309,93'}]);await f.post('RECEBER','90071992547409,93','2026-02-03',[{amount:'90071992547409,93'}]);
    const r=await report(f,'conciliacao',{},'all');assert.equal(r.totals[0].received,BigInt('9007199254740993'));assert(financialReportCsv(r).includes('9007199254740993'));reconciles(r);
  });
  for(const kind of ['faturamento','conciliacao'] as const)it(`snapshot ${kind} não mistura totais e itens diante de pagamento concorrente`,async()=>{
    const f=await fixture();let inserted=false;
    const proxy={$transaction:async(callback:(tx:Prisma.TransactionClient)=>Promise<unknown>,options:unknown)=>db.$transaction(async tx=>callback(new Proxy(tx,{get(target,key){if(key==='$queryRaw')return async(...args:unknown[])=>{const result=await (target.$queryRaw as (...values:unknown[])=>Promise<unknown>)(...args);if(!inserted){inserted=true;await f.post('RECEBER','60,00','2026-02-02',[{amount:'60,00'}]);}return result;};return Reflect.get(target,key);}})),options as never)};
    const r=await readFinancialReport(proxy as unknown as Pick<PrismaClient,'$transaction'>,kind,filters(kind,{contractId:f.contractId}),'all');assert.equal(r.items[0].received,n(0));assert.equal(r.totals[0].received,n(0));reconciles(r);assert.equal((await report(f,kind)).totals[0].received,n(6000));
  });
  it('vazio tem totais/CSV definidos sem inventar obrigações',async()=>{
    const r=await readFinancialReport(db,'faturamento',filters('faturamento',{contractId:randomUUID()}),'all');assert.equal(r.total,0);assert.deepEqual(r.items,[]);assert.deepEqual(r.totals,[]);assert(financialReportCsv(r).startsWith('\uFEFF'));assert.equal(r.labels.contractId,'Registro inexistente (nenhum resultado)');
  });
});
