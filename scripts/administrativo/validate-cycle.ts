import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '../../src/generated/prisma/client';
import {runAdministrativeCycle} from '../../test/integration/administrative-cycle-fixture';

// No remote URL or existing application database is accepted by this executable.
async function main(){
const url=new URL(process.env.DATABASE_URL??'');
assert(process.env.ADM106_LOCAL_SYNTHETIC==='1','Confirme o modo sintético local.');
assert(['127.0.0.1','localhost'].includes(url.hostname)&&/^\/fisio_adm106_\d+$/.test(url.pathname),'Use somente banco descartável fisio_adm106_<timestamp> em localhost.');
const count=Number(process.argv[2]??1),output=process.argv[3];
assert(output&&/^release[/\\]/.test(output),'Saída deve ficar em release/.');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
try{
  assert.equal(await db.user.count(),0,'A massa exige banco novo, sem usuários.');
  const result=await runAdministrativeCycle(db,count);
  await writeFile(output,JSON.stringify(result,null,2)+'\n');
  console.log(`Ciclo sintético aprovado: ${count} guias, ${result.xml.bytes} bytes; homologação externa PENDENTE.`);
}finally{await db.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
