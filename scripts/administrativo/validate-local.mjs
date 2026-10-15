/** Local disposable PostgreSQL 18 only. Never uses .env or a remote database. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import pg from 'pg';

const container='fisio-adm99-test',stamp=String(Date.now());
const source=`fisio_adm106_${stamp}`,target=source+'_restore';
const count=Number(process.argv[2]??1);
assert(Number.isInteger(count)&&count>=1&&count<=100,'Informe 1 a 100 guias sintéticas.');
const folder=`release/106-${stamp}`;mkdirSync(folder,{recursive:true});
const run=(command,args,options={})=>execFileSync(command,args,{encoding:'utf8',maxBuffer:32*1024*1024,...options});
const docker=(...args)=>run('docker',['exec',container,...args]);
const password=docker('printenv','POSTGRES_PASSWORD').trim();
assert(password,'Container local deve ter senha configurada.');
const url=name=>`postgresql://fisio:${encodeURIComponent(password)}@127.0.0.1:55499/${name}?schema=public`;
const sql=(database,text)=>docker('psql','-U','fisio','-d',database,'-v','ON_ERROR_STOP=1','-At','-c',text);
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const sha=value=>createHash('sha256').update(value).digest('hex');
const revision=run('git',['rev-parse','HEAD']).trim();
const dirty=run('git',['status','--porcelain']).trim()!=='';
const dump=`/tmp/adm106-${stamp}.dump`;
// CREATE DATABASE refuses collisions. No DROP, TRUNCATE, or overwrite of existing DBs.
sql('postgres',`CREATE DATABASE ${quote(source)}`);
const env={...process.env,DATABASE_URL:url(source),DATABASE_URL_UNPOOLED:url(source),ADM106_LOCAL_SYNTHETIC:'1'};
writeFileSync(`${folder}/migrate.log`,run(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env}));
const cycleStart=Date.now();
writeFileSync(`${folder}/cycle.log`,run(process.execPath,['--import','tsx','--conditions=react-server','scripts/administrativo/validate-cycle.ts',String(count),`${folder}/cycle.json`],{env}));
const cycleMs=Date.now()-cycleStart;
async function snapshot(database){
  const client=new pg.Client({connectionString:url(database)});await client.connect();
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const inventory={};
    for(const {tablename} of tables){
      const rows=(await client.query(`SELECT row_to_json(t)::text AS row FROM public.${quote(tablename)} t ORDER BY row_to_json(t)::text COLLATE "C"`)).rows;
      inventory[tablename]={rows:rows.length,sha256:sha(rows.map(row=>row.row).join('\n'))};
    }
    // PostgreSQL may reparse CHECK array casts during restore. Compare validated
    // identity/type/columns for CHECKs, exact definitions for FK/unique/PK constraints.
    const constraints=(await client.query("SELECT c.conrelid::regclass::text AS table_name,c.conname,c.contype,c.convalidated,c.conkey,CASE WHEN c.contype='c' THEN NULL ELSE pg_get_constraintdef(c.oid) END AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY 1,2")).rows;
    const triggers=(await client.query("SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2")).rows;
    const functions=(await client.query("SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosrc,p.proconfig,p.provolatile,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY 1,2")).rows;
    const sequences={};
    for(const {sequencename} of (await client.query("SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows)sequences[sequencename]=(await client.query(`SELECT last_value::text,is_called FROM public.${quote(sequencename)}`)).rows[0];
    // bytea is compared separately as bytes and against its persisted digest.
    const artifacts=(await client.query('SELECT id,bytes,"fileHash","batchId","contentDigest","actorId" FROM "BatchArtifact" ORDER BY id')).rows;
    const files=artifacts.map(({bytes,...row})=>{assert.equal(sha(bytes),row.fileHash);return {...row,bytes:bytes.length,sha256:sha(bytes)};});
    await client.query('COMMIT');return {inventory,constraints,triggers,functions,sequences,files};
  }finally{await client.end();}
}
const before=await snapshot(source),dumpStart=Date.now();
docker('pg_dump','-U','fisio','-d',source,'-Fc','-f',dump);
const dumpMs=Date.now()-dumpStart;sql('postgres',`CREATE DATABASE ${quote(target)}`);
const restoreStart=Date.now();
docker('pg_restore','-U','fisio','-d',target,'--exit-on-error','--single-transaction',dump);
const restoreMs=Date.now()-restoreStart,after=await snapshot(target);
assert.deepEqual(after,before,'Restore precisa preservar todas as linhas, bytes, vínculos, triggers e sequências.');
const cycle=JSON.parse(readFileSync(`${folder}/cycle.json`,'utf8'));
const receiptCheck=sql(target,`SELECT count(*) FROM "OperatorReceivable" WHERE "batchId"='${cycle.batchId}'`);assert.equal(Number(receiptCheck.trim()),count);
const restoredClient=new pg.Client({connectionString:url(target)});await restoredClient.connect();
try{
  // Exercise the restored guard, not only its metadata. This statement must roll back.
  await assert.rejects(restoredClient.query('UPDATE "BatchArtifact" SET bytes=bytes WHERE id=$1',[cycle.artifactId]),error=>error.code==='23514');
  const {rows:[balance]}=await restoredClient.query('SELECT coalesce(sum("receivedDelta"),0)::text AS received,coalesce(sum("analysisDelta"),0)::text AS analysis FROM "OperatorSettlementLine" l JOIN "OperatorReceivable" r ON r.id=l."receivableId" WHERE r."batchId"=$1',[cycle.batchId]);
  assert.equal(balance.received,cycle.receivedCents);assert.equal(balance.analysis,cycle.analysisCents);
}finally{await restoredClient.end();}
const result={version:1,environment:'LOCAL DESCARTAVEL SINTETICO',revision,workingTreeModified:dirty,externalHomologation:'PENDENTE',sourceDatabase:source,restoredDatabase:target,container,guideCount:count,cycleMs,dumpMs,restoreMs,verifiedAt:new Date().toISOString(),...after};
writeFileSync(`${folder}/recovery.json`,JSON.stringify(result,null,2)+'\n');
console.log(`PASS: ciclo + pg_dump/pg_restore; ${count} guias; ${Object.keys(after.inventory).length} tabelas idênticas. Evidências: ${folder}`);
console.log('Bancos e dump preservados para inspeção; nenhuma homologação externa ou publicação executada.');
