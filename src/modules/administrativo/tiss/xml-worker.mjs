// Worker separado: tempo máximo aplicado pelo chamador; schemas exclusivamente locais.
import {parentPort,workerData} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {XmlDocument,XsdValidator,ParseOption,xmlRegisterInputProvider,openBuffer,readBuffer,closeBuffer} from 'libxml2-wasm';
let doc,schema,validator;
try {
 const dir=new URL('./schemas/4.03.00/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',dir),'utf8'));
 const buffers=Object.create(null);
 for(const [name,hash]of Object.entries(manifest.files)){const bytes=readFileSync(new URL(name,dir));if(createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error('schema-integrity');buffers[name]=bytes;}
 // Captura toda tentativa de resolução. Nenhuma URL, DTD, entidade, catálogo ou arquivo arbitrário.
 xmlRegisterInputProvider({match:()=>true,open:name=>Object.hasOwn(buffers,name)?openBuffer(buffers[name]):undefined,read:readBuffer,close:fd=>{closeBuffer(fd);return true;}});
 const option=ParseOption.XML_PARSE_NO_XXE|ParseOption.XML_PARSE_NONET|ParseOption.XML_PARSE_NO_SYS_CATALOG;
 const text=Buffer.from(workerData.bytes).toString('latin1');
 if(!text.startsWith('<?xml version="1.0" encoding="ISO-8859-1"?>')||/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('declaration');
 schema=XmlDocument.fromBuffer(buffers['tissV4_03_00.xsd'],{option});validator=XsdValidator.fromDoc(schema);
 doc=XmlDocument.fromBuffer(workerData.bytes,{option});validator.validate(doc);
 parentPort.postMessage({ok:true,schemaDigest:createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex')});
}catch{ // Nunca devolver mensagens libxml: elas podem conter dados clínicos/identificadores.
 parentPort.postMessage({ok:false});
}finally{validator?.dispose();schema?.dispose();doc?.dispose();}
