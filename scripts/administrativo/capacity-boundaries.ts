import assert from 'node:assert/strict';
import {writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '../../src/generated/prisma/client';
import {runAdministrativeCycle} from '../../test/integration/administrative-cycle-fixture';
async function main(){
  const folder=process.argv[2],url=new URL(process.env.DATABASE_URL??'');
  assert(/^release[/\\]131-\d+$/.test(folder)&&process.env.ADM131_LOCAL_SYNTHETIC==='1'&&url.hostname==='127.0.0.1'&&url.pathname===`/fisio_adm131_${folder.split(/[/\\]/).at(-1)!.slice(4)}`);
  assert(!existsSync(`${folder}/batch-boundaries.json`),'Ensaio já executado.');
  const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})}),results=[];
  try{
    for(const kind of ['guides','items'] as const){
      let cohort:{contractId:string;batchId:string;guideIds:string[];productionIds:string[];itemCount:number}|undefined;
      const start=performance.now();
      await assert.rejects(runAdministrativeCycle(db,kind==='guides'?101:100,kind==='guides'?1:10,(phase,data)=>{
        if(phase==='composed')cohort=data as unknown as NonNullable<typeof cohort>;
      },kind),/Composição excede os limites/);
      assert(cohort);const {batchId,guideIds,productionIds}=cohort;
      assert.equal(await db.billingBatch.count({where:{id:batchId}}),0);
      assert.equal(await db.batchChange.count({where:{batchId}}),0);
      assert.equal(await db.batchArtifact.count({where:{batchId}}),0);
      assert.equal(await db.batchSend.count({where:{batchId}}),0);
      assert.equal(await db.operatorReceivable.count({where:{batchId}}),0);
      assert.equal(await db.billingGuide.count({where:{id:{in:guideIds},state:'APTA'}}),guideIds.length);
      assert.equal(await db.productionItem.count({where:{id:{in:productionIds},state:'APTO'}}),productionIds.length);
      results.push({kind,guides:guideIds.length,items:productionIds.length,refused:true,batchRows:0,historyRows:0,elapsedMs:performance.now()-start});
      console.log(`PASS limite+1: ${guideIds.length} guias / ${productionIds.length} itens; sem lote/histórico parcial.`);
    }
    writeFileSync(`${folder}/batch-boundaries.json`,JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),results},null,2)+'\n');
  }finally{await db.$disconnect();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
