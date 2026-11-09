import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '../../src/generated/prisma/client';
import {verifyCapacityReports,addCapacityItem,verifyExportRefusal,verifyXmlPersistenceRefusal} from '../../test/integration/capacity-report-scenarios';
import {findXmlBoundary,capacityXmlBatch} from '../../test/fixtures/tiss/capacity';
import {serializeTiss} from '../../src/modules/administrativo/tiss/serialize';
import {validateTissXsd,XML_HARD_LIMIT} from '../../src/modules/administrativo/tiss/xsd';
async function main(){
  const folder=process.argv[2],url=new URL(process.env.DATABASE_URL??'');
  assert(/^release[/\\]131-\d+$/.test(folder)&&process.env.ADM131_LOCAL_SYNTHETIC==='1'&&url.hostname==='127.0.0.1'&&url.pathname===`/fisio_adm131_${folder.split(/[/\\]/).at(-1)!.slice(4)}`,'Somente o banco local do ensaio.');
  assert(!existsSync(`${folder}/exports.json`),'Verificação já executada; use outro ensaio para não adicionar item novamente.');
  const cycles=JSON.parse(readFileSync(`${folder}/cycles.json`,'utf8'));
  const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
  const write=(name:string,data:unknown)=>writeFileSync(`${folder}/${name}.json`,JSON.stringify(data,null,2)+'\n');
  try{
    const full=await verifyCapacityReports(db,cycles,10000,{},(type,csv)=>writeFileSync(`${folder}/${type}.csv`,csv));
    write('exports',{revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),...full});
    const boundary=findXmlBoundary(),xsd=await validateTissXsd(boundary.result.bytes);
    writeFileSync(`${folder}/xml-boundary.xml`,boundary.result.bytes);
    assert.throws(()=>serializeTiss(capacityXmlBatch(boundary.descriptionLength+1)),/limite de bytes/);
    const persistence=await verifyXmlPersistenceRefusal(db,cycles[0]);
    write('xml-boundary',{bytes:boundary.result.bytes.length,sha256:createHash('sha256').update(boundary.result.bytes).digest('hex'),limit:XML_HARD_LIMIT,descriptionLength:boundary.descriptionLength,...xsd,persistence});
    const extra=await addCapacityItem(db,cycles[0]);write('extra',extra);
    write('refusal',await verifyExportRefusal(db));
    console.log('PASS: 10.000 linhas completas; 10.001 recusadas; XML >=99% de 2 MiB validado; originais preservados.');
  }finally{await db.$disconnect();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
