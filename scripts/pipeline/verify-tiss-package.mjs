import assert from 'node:assert/strict';
import {cp, mkdir, mkdtemp, readFile, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, relative, resolve} from 'node:path';
import {Worker} from 'node:worker_threads';

// Exercise the actual traced runtime with no node_modules alias to hide missing files.
const root=process.cwd();
const moduleDirectory=relative(root,await realpath('node_modules/libxml2-wasm'));
const trace=resolve('.next/server/app/(app)/administrativo/lotes/[id]/page.js.nft.json');
const files=JSON.parse(await readFile(trace,'utf8')).files.map(file=>resolve(dirname(trace),file));
const alias=join(root,'node_modules/libxml2-wasm');
const physical=join(root,moduleDirectory);
if(alias!==physical) assert(!files.some(file=>file.startsWith(alias+'/')||file.startsWith(alias+'\\')),'Trace contains children beneath the pnpm symlink');
const runtime=files.filter(file=>file.startsWith(physical+'/')||file.startsWith(physical+'\\')||file.startsWith(join(root,'src/modules/administrativo/tiss')+'/')||file.startsWith(join(root,'src/modules/administrativo/tiss')+'\\'));
assert(runtime.includes(join(physical,'lib/index.mjs')),'Validator missing from trace');
const isolated=await mkdtemp(join(tmpdir(),'tiss-package-'));
try {
  for(const file of runtime){
    const destination=join(isolated,relative(root,file));
    await mkdir(dirname(destination),{recursive:true});
    await cp(file,destination);
  }
  const worker=new Worker(join(isolated,'src/modules/administrativo/tiss/xml-worker.mjs'),{
    workerData:{bytes:await readFile('test/fixtures/tiss/lote-4.03.00.xml'),validatorModule:join(isolated,moduleDirectory,'lib/index.mjs')},
    execArgv:[],
  });
  try {
    const result=await new Promise((res,rej)=>{
      const timeout=setTimeout(()=>rej(new Error('Packaged validator timed out')),10000);
      worker.once('message',value=>{clearTimeout(timeout);res(value);});
      worker.once('error',error=>{clearTimeout(timeout);rej(error);});
      worker.once('exit',code=>{clearTimeout(timeout);if(code)rej(new Error(`Worker exit ${code}`));});
    });
    assert.equal(result.ok,true,'Packaged validator rejected the synthetic golden XML');
  } finally {await worker.terminate();}
  console.log('TISS trace: physical package, schemas and isolated validation passed.');
} finally {await rm(isolated,{recursive:true,force:true});}
