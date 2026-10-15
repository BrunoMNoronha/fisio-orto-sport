import {Worker} from "node:worker_threads";
import {join} from "node:path";
import {AdministrativeConfigError} from "../service";
export const XML_HARD_LIMIT=2*1024*1024;
export async function validateTissXsd(bytes:Uint8Array):Promise<{schemaDigest:string}>{
 if(!bytes.length||bytes.length>XML_HARD_LIMIT)throw new AdministrativeConfigError('XML excede o limite técnico de 2 MiB. Divida o lote.');
 return new Promise((resolve,reject)=>{
  const validatorModule=join(process.cwd(),process.env.TISS_XML_VALIDATOR_MODULE||'node_modules/libxml2-wasm/lib/index.mjs');
  const worker=new Worker(join(process.cwd(),'src/modules/administrativo/tiss/xml-worker.mjs'),{workerData:{bytes,validatorModule},resourceLimits:{maxOldGenerationSizeMb:128},execArgv:[]});
  let done=false;const finish=(error?:string,digest?:string)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(new AdministrativeConfigError(error));else resolve({schemaDigest:digest!});};
  const timer=setTimeout(()=>{void worker.terminate();finish('Validação XML excedeu 10 segundos. Nenhum arquivo foi registrado.');},10000);
  worker.once('message',r=>r.ok&&typeof r.schemaDigest==='string'?finish(undefined,r.schemaDigest):finish('XML recusado pelo schema ANS 4.03.00. Revise os campos e códigos da guia; nenhum arquivo foi registrado.'));
  worker.once('error',()=>finish('Validador XML indisponível; nenhum arquivo foi registrado.'));
  worker.once('exit',()=>{if(!done)finish('Validador XML interrompido; nenhum arquivo foi registrado.');});
 });
}
