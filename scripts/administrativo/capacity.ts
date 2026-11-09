import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '../../src/generated/prisma/client';
import {runAdministrativeCycle} from '../../test/integration/administrative-cycle-fixture';

async function main(){
  const url=new URL(process.env.DATABASE_URL??'');
  assert(process.env.ADM131_LOCAL_SYNTHETIC==='1'&&['127.0.0.1','localhost'].includes(url.hostname)&&/^\/fisio_adm131_\d+$/.test(url.pathname),'Somente banco sintético local novo.');
  const count=Number(process.argv[2]),folder=process.argv[3];
  assert(Number.isInteger(count)&&count>=1&&count<=11&&/^release[/\\]131-\d+$/.test(folder));
  const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const modified=execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()!=='';
  let queries=0;
  const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()}),log:[{emit:'event',level:'query'}]});
  db.$on('query',()=>{queries++;});
  const write=(name:string,data:unknown)=>writeFileSync(`${folder}/${name}.json`,JSON.stringify(data,null,2)+'\n');
  const results=[];
  try{
    assert.equal(await db.user.count(),0,'Exige banco novo.');
    for(let index=0;index<count;index++){
      console.log(`Lote ${index+1}/${count}: 100 guias / 1.000 itens`);
      const start=queries;
      const cycle=await runAdministrativeCycle(db,100,10,(phase,data)=>write('progress',{index,phase,...data,queries}));
      results.push({...cycle,queries:queries-start});write('cycles',results);
      console.log(`Lote ${index+1}: fechamento ${cycle.timings.closeMs.toFixed(0)} ms; ciclo ${cycle.timings.totalMs.toFixed(0)} ms.`);
    }
    write('result',{revision,modified,environment:'LOCAL SINTETICO',externalHomologation:'PENDENTE',database:url.pathname.slice(1),batches:count,queries,results});
  }catch(error){write('failure',{revision,modified,queries,message:error instanceof Error?error.message:String(error)});throw error;}
  finally{await db.$disconnect();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
