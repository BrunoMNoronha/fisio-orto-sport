import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {before,after,describe,it} from 'node:test';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '@/generated/prisma/client';
import {runAdministrativeCycle} from './administrative-cycle-fixture';
import {saveSettlement,receivableBalance} from '@/modules/administrativo/settlement-service';
import {settlementSchema} from '@/modules/administrativo/settlement-validation';
import {exactXmlBytes} from '@/modules/administrativo/tiss/xml-service';
const url=process.env.INTEGRATION_DATABASE_URL;
if(process.env.CI&&!url)throw new Error('Banco obrigatório');
describe('ciclo administrativo integrado PostgreSQL (#106)',{skip:!url},()=>{
  let db:PrismaClient;
  before(()=>{db=new PrismaClient({adapter:new PrismaPg({connectionString:url!})});});
  after(async()=>{await db?.$disconnect();});
  it('cobertura → autorização → sessão → produção → guia → lote → XML XSD → envio simulado → recebido/glosa → relatórios',async()=>{
    const result=await runAdministrativeCycle(db);
    assert.equal(result.authorized,10);assert.equal(result.consumed,2);assert.equal(result.available,8);
    assert.deepEqual([result.billedCents,result.receivedCents,result.analysisCents,result.openCents],['10000','6000','2000','2000']);
    const artifact=await db.batchArtifact.findUniqueOrThrow({where:{id:result.artifactId}});
    assert.throws(()=>exactXmlBytes({...artifact,bytes:Uint8Array.from([1,2,3])}),/checksum/);
  });
  it('recebimentos concorrentes disputam os últimos R$20 sem ultrapassar a obrigação do ciclo',async()=>{
    const f=await runAdministrativeCycle(db);
    const input=()=>settlementSchema.parse({id:randomUUID(),requestId:randomUUID(),contractId:f.contractId,kind:'RECEBER',amount:'20,00',effectiveOn:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()),reference:'CONCORRENCIA LOCAL 106',reason:'Teste do saldo remanescente',lines:[{receivableId:f.productionId,amount:'20,00'}]});
    const results=await Promise.allSettled([saveSettlement(db,f.users.admin,input()),saveSettlement(db,f.users.admin,input())]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
    const balance=await db.$transaction(tx=>receivableBalance(tx,f.productionId));assert(balance);
    assert.equal(balance.open,BigInt(0));assert.equal(balance.received,BigInt(8000));assert.equal(balance.analysis,BigInt(2000));
  });
  it('falha após criar cabeçalho desfaz todo o recebimento e preserva XML/obrigações',async()=>{
    const f=await runAdministrativeCycle(db),id=randomUUID();
    const broken=db.$extends({query:{operatorSettlementLine:{async createMany(){throw new Error('FALHA LOCAL 106');}}}});
    const input=settlementSchema.parse({id,requestId:randomUUID(),contractId:f.contractId,kind:'RECEBER',amount:'10,00',effectiveOn:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()),reference:'FALHA LOCAL 106',reason:'Rollback integrado',lines:[{receivableId:f.productionId,amount:'10,00'}]});
    await assert.rejects(saveSettlement(broken as unknown as Pick<PrismaClient,'$transaction'>,f.users.admin,input),/FALHA LOCAL/);
    assert.equal(await db.operatorSettlement.count({where:{id}}),0);
    const balance=await db.$transaction(tx=>receivableBalance(tx,f.productionId));assert.equal(balance?.open,BigInt(2000));
    const artifact=await db.batchArtifact.findUniqueOrThrow({where:{id:f.artifactId}});assert.equal(artifact.fileHash,f.xml.sha256);exactXmlBytes(artifact);
  });
});
