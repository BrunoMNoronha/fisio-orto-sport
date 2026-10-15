import {TISS_DEFAULTS} from "./tiss/profile";
import {createHash,randomUUID} from "node:crypto";
import type {Prisma,PrismaClient} from "@/generated/prisma/client";
import {lockBeneficiary} from "./beneficiary-service";
import {revalidateGuideTx,recordGuideChange} from "./guide-service";
import {recordProductionChange} from "./production-service";
import {AdministrativeConfigError,CONFIG_CONFLICT} from "./service";
import type {BatchInput} from "./batch-validation";
type Tx=Prisma.TransactionClient;
const json=(v:unknown):Prisma.InputJsonObject=>JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x));
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(json(v))).digest('hex');
const fail=(message:string):never=>{throw new AdministrativeConfigError(message);};
export async function recordBatchChange(tx:Tx,id:string,actorId:string,reason:string,requestId:string,fingerprint:string){await tx.$executeRaw`INSERT INTO "BatchChange"(id,"batchId",version,"actorId",reason,"requestId",fingerprint,snapshot) SELECT ${randomUUID()},b.id,b.version,${actorId},${reason},${requestId},${fingerprint},jsonb_build_object('batch',to_jsonb(b),'guides',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]'::jsonb) FROM "BatchGuide" i WHERE i."batchId"=b.id),'sends',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]'::jsonb) FROM "BatchSend" i WHERE i."batchId"=b.id)) FROM "BillingBatch" b WHERE b.id=${id}`;}
async function lockBatchContext(tx:Tx,id:string,guideIds:string[]){
 // Pré-travar TODOS os pacientes antes da trava comum, inclusive guias já compostas.
 const guides=await tx.billingGuide.findMany({where:{OR:[{id:{in:guideIds}},{batches:{some:{batchId:id,active:true}}}]},select:{id:true,coverage:{select:{patientId:true}},items:{where:{active:true},select:{production:{select:{id:true,sessionId:true}}}}}});
 for(const patientId of [...new Set(guides.map(g=>g.coverage.patientId))].sort())await tx.$queryRaw`SELECT id FROM "Patient" WHERE id=${patientId} FOR UPDATE`;
 await lockBeneficiary(tx);
 for(const sessionId of [...new Set(guides.flatMap(g=>g.items.map(i=>i.production.sessionId)))].sort())await tx.$queryRaw`SELECT id FROM "TreatmentSession" WHERE id=${sessionId} FOR UPDATE`;
 for(const guideId of guides.map(g=>g.id).sort())await tx.$queryRaw`SELECT id FROM "BillingGuide" WHERE id=${guideId} FOR UPDATE`;
 for(const productionId of [...new Set(guides.flatMap(g=>g.items.map(i=>i.production.id)))].sort())await tx.$queryRaw`SELECT id FROM "ProductionItem" WHERE id=${productionId} FOR UPDATE`;
 await tx.$queryRaw`SELECT id FROM "BillingBatch" WHERE id=${id} FOR UPDATE`;
}
async function composition(tx:Tx,id:string){return tx.batchGuide.findMany({where:{batchId:id,active:true},orderBy:{guideId:'asc'},include:{guide:{include:{items:{where:{active:true},orderBy:{productionId:'asc'},include:{production:{select:{id:true,state:true,version:true,adjustmentPending:true,amountCents:true}}}}}}}});}
export async function saveBatch(db:Pick<PrismaClient,'$transaction'>,actorId:string,input:BatchInput){const fingerprint=hash(input);
 try{return await db.$transaction(async tx=>{
 await lockBatchContext(tx,input.id,input.guideIds);
 const replay=await tx.batchChange.findUnique({where:{requestId:input.requestId}});if(replay){if(replay.fingerprint!==fingerprint)fail('Envio reutilizado com outros dados.');return replay.batchId;}
 const current=await tx.billingBatch.findUnique({where:{id:input.id}});if((current?.version??0)!==input.expectedVersion)fail(CONFIG_CONFLICT);
 if(current&&(current.contractId!==input.contractId||current!.tissVersion!==input.tissVersion))fail('Contrato/versão do lote são imutáveis.');
 if(current?.state==='CANCELADO')fail('Lote cancelado preservado.');
 const contract=await tx.operatorContract.findUnique({where:{id:input.contractId},include:{operator:{select:{id:true,name:true,active:true}}}});if(!contract)fail('Contrato inexistente.');
 if(!current&&input.operation!=='SALVAR')fail('Prepare o lote aberto primeiro.');
 if(['SALVAR','FECHAR'].includes(input.operation)&&current&&current!.state!=='ABERTO')fail('Composição fechada não pode ser editada.');
 if(input.operation==='SALVAR'){
 if(!contract!.active||!contract!.operator.active||contract!.tissVersion!==input.tissVersion)fail('Contrato/operadora inativos ou versão TISS incompatível.');
 const guides=await tx.billingGuide.findMany({where:{id:{in:input.guideIds}},select:{id:true,contractId:true,state:true,snapshot:true,items:{where:{active:true},select:{id:true}}}});
 if(guides.length!==input.guideIds.length||guides.some(g=>g.contractId!==input.contractId||g.state!=='APTA'||(g.snapshot as {contract?:{tissVersion?:string}}).contract?.tissVersion!==input.tissVersion))fail('Todas as guias devem estar aptas e pertencer ao mesmo contrato/versão.');
 const profiles=new Set(guides.map(g=>JSON.stringify((g.snapshot as {profile?:unknown}).profile)));if(profiles.size>1)fail('Perfis de guia incompatíveis; divida em lotes separados.');
 if(guides.length>contract!.maxGuides||guides.reduce((n,g)=>n+g.items.length,0)>contract!.maxItems)fail('Composição excede os limites do contrato. Divida o lote; nenhum item foi truncado.');
 if(current)await tx.billingBatch.update({where:{id:input.id},data:{version:{increment:1}}});else{const seq=await tx.batchSequence.upsert({where:{contractId:input.contractId},create:{contractId:input.contractId,lastNumber:BigInt(1)},update:{lastNumber:{increment:1}}});await tx.billingBatch.create({data:{id:input.id,contractId:input.contractId,number:seq.lastNumber,tissVersion:input.tissVersion,snapshot:{}}});}
 const links=await tx.batchGuide.findMany({where:{batchId:input.id,active:true}});for(const l of links)if(!input.guideIds.includes(l.guideId))await tx.batchGuide.update({where:{id:l.id},data:{active:false}});for(const guideId of input.guideIds)if(!links.some(l=>l.guideId===guideId))await tx.batchGuide.create({data:{batchId:input.id,guideId}});
 }else if(input.operation==='FECHAR'){
 if(current?.state!=='ABERTO')fail('Lote precisa estar aberto.');
 if(!contract!.active||!contract!.operator.active||contract!.tissVersion!==current!.tissVersion)fail('Configuração contratual alterada; revise o lote.');
 const links=await composition(tx,input.id);if(JSON.stringify(links.map(l=>l.guideId).sort())!==JSON.stringify([...input.guideIds].sort()))fail('Salve a composição selecionada antes de fechar.');if(!links.length)fail('Selecione ao menos uma guia apta.');if(links.length>contract!.maxGuides||links.reduce((n,l)=>n+l.guide.items.length,0)>contract!.maxItems)fail('Limites do contrato excedidos. Divida o lote.');
 const profiles=new Set(links.map(l=>JSON.stringify((l.guide.snapshot as {profile?:unknown}).profile)));if(profiles.size!==1)fail('Perfis de guia incompatíveis.');
 let total=BigInt(0);const frozen=[];
 // Todas as revalidações precedem qualquer mudança de estado.
 for(const l of links){const result=await revalidateGuideTx(tx,l.guideId);if(result.status!=='OK')fail('Guia '+String(l.guide.number)+': '+result.status+'. Devolva e confira as fontes.');if(l.guide.contractId!==input.contractId||(l.guide.snapshot as {contract?:{tissVersion?:string}}).contract?.tissVersion!==input.tissVersion)fail('Lote misto entre contratos/versões.');total+=l.guide.totalCents;frozen.push({guideId:l.guideId,number:String(l.guide.number),month:l.guide.month,guideVersion:l.guide.version,sourceDigest:l.guide.sourceDigest,totalCents:String(l.guide.totalCents),snapshot:l.guide.snapshot,clinicalIndication:l.guide.clinicalIndication,clinicalConfirmed:l.guide.clinicalConfirmed,items:l.guide.items.map(i=>({id:i.productionId,snapshot:i.snapshot}))});}
 if(total>BigInt('9223372036854775807'))fail('Total excede capacidade em centavos; divida o lote.');
 for(const l of links){for(const i of l.guide.items){await tx.productionItem.update({where:{id:i.productionId},data:{state:'FECHADO',version:{increment:1}}});await recordProductionChange(tx,i.productionId,actorId,input.reason,randomUUID(),fingerprint);}await tx.billingGuide.update({where:{id:l.guideId},data:{state:'EM_LOTE',version:{increment:1}}});await recordGuideChange(tx,l.guideId,actorId,input.reason,randomUUID(),fingerprint);await tx.batchGuide.update({where:{id:l.id},data:{closedGuideVersion:l.guide.version+1}});}
 const xmlProfile=await tx.tissProfile.findFirst({where:{contractId:input.contractId},orderBy:{version:'desc'},select:{id:true,version:true,data:true}});
 const snapshot=json({xmlProfile:xmlProfile??{id:null,version:0,data:TISS_DEFAULTS},contract:{id:contract!.id,name:contract!.name,version:contract!.version,operatorId:contract!.operator.id,operator:contract!.operator.name,tissVersion:current!.tissVersion,maxGuides:contract!.maxGuides,maxItems:contract!.maxItems,maxXmlBytes:contract!.maxXmlBytes,maxExportRows:contract!.maxExportRows},guides:frozen});
 await tx.billingBatch.update({where:{id:input.id},data:{state:'FECHADO',version:{increment:1},contentVersion:1,closedAt:new Date(),snapshot,contentDigest:hash(snapshot),totalCents:total}});
 }else if(input.operation==='CANCELAR'){
 if(!current||!['ABERTO','FECHADO'].includes(current!.state))fail('Somente lote aberto/fechado sem envio pode ser cancelado.');
 const links=await composition(tx,input.id);await tx.billingBatch.update({where:{id:input.id},data:{state:'CANCELADO',version:{increment:1}}});
 for(const l of links){if(current!.state==='FECHADO'){for(const i of l.guide.items){if(i.production.state!=='FECHADO')fail('Produção não está fechada; revisão necessária.');await tx.productionItem.update({where:{id:i.productionId},data:{state:'APTO',version:{increment:1}}});await recordProductionChange(tx,i.productionId,actorId,input.reason,randomUUID(),fingerprint);}await tx.billingGuide.update({where:{id:l.guideId},data:{state:'APTA',version:{increment:1}}});await recordGuideChange(tx,l.guideId,actorId,input.reason,randomUUID(),fingerprint);}await tx.batchGuide.update({where:{id:l.id},data:{active:false}});}
 }else{
 if(!current||!['FECHADO','ENVIADO'].includes(current!.state))fail('Envio exige lote fechado e arquivo validado.');
 if(input.operation==='ENVIAR'&&current!.state!=='FECHADO'||input.operation==='CORRIGIR_ENVIO'&&current!.state!=='ENVIADO')fail('Transição de envio inválida.');
 if(!input.artifactId||!input.sentOn||!input.protocol||!input.channel)fail('Informe arquivo validado, data civil, protocolo e canal do envio manual.');
 const artifact=await tx.batchArtifact.findUnique({where:{id:input.artifactId!},select:{id:true,batchId:true,contentDigest:true,createdAt:true,purpose:true}});if(!artifact||artifact.batchId!==current!.id||artifact.contentDigest!==current!.contentDigest)fail('Arquivo validado não corresponde a este lote.');
 if(artifact!.purpose!=='PRODUCAO')fail('Arquivo de homologação/legado não pode constituir envio de produção.');
 const civil=(d:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(d);const sent=input.sentOn!.toISOString().slice(0,10);if(sent<civil(current!.closedAt!)||sent<civil(artifact!.createdAt)||sent>civil(new Date()))fail('Data de envio deve ser posterior ou igual ao fechamento/arquivo e não pode ser futura.');
 const links=await composition(tx,input.id);if(input.operation==='ENVIAR'&&links.some(l=>l.guide.items.some(i=>i.production.adjustmentPending)))fail('Há ajuste pendente após fechamento. Cancele e revise antes do envio.');
 const previous=await tx.batchSend.findFirst({where:{batchId:input.id,correctedBy:null},orderBy:[{createdAt:'desc'},{id:'desc'}]});
 if(input.operation==='CORRIGIR_ENVIO'&&(!input.correctsId||previous?.id!==input.correctsId))fail('Recarregue e referencie o último envio para corrigir.');if(input.operation==='ENVIAR'&&input.correctsId)fail('Primeiro envio não é correção.');
 await tx.batchSend.create({data:{batchId:input.id,artifactId:input.artifactId!,correctsId:input.operation==='CORRIGIR_ENVIO'?input.correctsId:null,sentOn:input.sentOn!,protocol:input.protocol,channel:input.channel,reason:input.reason,actorId,requestId:input.requestId}});
 await tx.billingBatch.update({where:{id:input.id},data:{state:'ENVIADO',version:{increment:1}}});
 if(input.operation==='ENVIAR')for(const l of links)for(const i of l.guide.items){await tx.productionItem.update({where:{id:i.productionId},data:{state:'ENVIADO',version:{increment:1}}});await recordProductionChange(tx,i.productionId,actorId,input.reason,randomUUID(),fingerprint);}
 }
 await recordBatchChange(tx,input.id,actorId,input.reason,input.requestId,fingerprint);return input.id;
 },{timeout:60000});}catch(e){if(e instanceof AdministrativeConfigError)throw e;if(typeof e==='object'&&e&&'code'in e&&e.code==='P2002')fail('Uma guia já pertence a outro lote ativo ou o envio foi reutilizado.');throw e;}
}
// Porta interna para #103: chamar SOMENTE após validar bytes contra XSD/regras do perfil.
// A #102 não implementa validador nem oferece Server Action de registro de artefato.
export async function registerValidatedBatchArtifactTx(tx:Tx,actorId:string,input:{id:string;batchId:string;contentDigest:string;bytes:Uint8Array;validationReference:string;requestId:string;purpose?:'HOMOLOGACAO'|'PRODUCAO';generatorVersion?:string;validationMetadata?:Prisma.InputJsonObject}){
 await lockBeneficiary(tx);await tx.$queryRaw`SELECT id FROM "BillingBatch" WHERE id=${input.batchId} FOR UPDATE`;
 const purpose=input.purpose??'LEGADO',generatorVersion=input.generatorVersion??'legacy',metadata=input.validationMetadata??{};
 const fileHash=createHash('sha256').update(input.bytes).digest('hex');const replay=await tx.batchArtifact.findUnique({where:{requestId:input.requestId}});if(replay){if(replay.batchId!==input.batchId||replay.contentDigest!==input.contentDigest||replay.fileHash!==fileHash||replay.validationReference!==input.validationReference||replay.purpose!==purpose||replay.generatorVersion!==generatorVersion||JSON.stringify(replay.validationMetadata)!==JSON.stringify(metadata))fail('Envio de artefato reutilizado com outros dados.');return replay;}
 const batch=await tx.billingBatch.findUniqueOrThrow({where:{id:input.batchId}});if(!['FECHADO','ENVIADO'].includes(batch.state)||batch.contentDigest!==input.contentDigest||!input.validationReference.trim())fail('Artefato exige conteúdo fechado correspondente.');
 const last=await tx.batchArtifact.findFirst({where:{batchId:input.batchId},orderBy:{version:'desc'},select:{version:true}});
 return tx.batchArtifact.create({data:{purpose,generatorVersion,validationMetadata:metadata,id:input.id,batchId:input.batchId,version:(last?.version??0)+1,contentVersion:batch.contentVersion,contentDigest:batch.contentDigest,bytes:Uint8Array.from(input.bytes),fileHash,validationReference:input.validationReference,actorId,requestId:input.requestId}});
}
