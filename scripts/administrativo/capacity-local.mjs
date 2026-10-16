/** Fresh local synthetic DB only; no .env, migration against remote, or deployment. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const batches=Number(process.argv[2]??1);
assert(Number.isInteger(batches)&&batches>=1&&batches<=11,'Use 1 a 11 lotes.');
const stamp=String(Date.now()),name=`fisio_adm131_${stamp}`,folder=`release/131-${stamp}`;
const run=(cmd,args,options={})=>execFileSync(cmd,args,{encoding:'utf8',maxBuffer:16*1024*1024,...options});
const docker=(...args)=>run('docker',['exec','fisio-adm99-test',...args]);
const password=docker('printenv','POSTGRES_PASSWORD').trim();assert(password);
mkdirSync(folder,{recursive:true});
docker('psql','-U','fisio','-d','postgres','-v','ON_ERROR_STOP=1','-c',`CREATE DATABASE "${name}"`);
const env={...process.env,DATABASE_URL:`postgresql://fisio:${encodeURIComponent(password)}@127.0.0.1:55499/${name}?schema=public`,ADM131_LOCAL_SYNTHETIC:'1'};
writeFileSync(`${folder}/migrate.log`,run(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env}));
console.log(`Banco novo ${name}; evidências ${folder}.`);
run(process.execPath,['--import','tsx','--conditions=react-server','scripts/administrativo/capacity.ts',String(batches),folder],{env,stdio:'inherit'});
