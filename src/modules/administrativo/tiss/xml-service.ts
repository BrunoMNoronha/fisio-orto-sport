import {createHash,randomUUID} from "node:crypto";
import type {PrismaClient} from "@/generated/prisma/client";
import type {z} from "zod";
import {lockBeneficiary} from "../beneficiary-service";
import {registerValidatedBatchArtifactTx} from "../batch-service";
import {AdministrativeConfigError,CONFIG_CONFLICT} from "../service";
import {generateXmlSchema} from "./profile";
import {serializeTiss,GENERATOR_VERSION} from "./serialize";
import {validateTissXsd} from "./xsd";
export async function generateBatchXml(db:Pick<PrismaClient,'$transaction'>,actorId:string,input:z.output<typeof generateXmlSchema>){
 const requestFingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 return db.$transaction(async tx=>{await lockBeneficiary(tx);await tx.$queryRaw`SELECT id FROM "BillingBatch" WHERE id=${input.batchId} FOR UPDATE`;
 const replay=await tx.batchArtifact.findUnique({where:{requestId:input.requestId},select:{id:true,batchId:true,validationMetadata:true}});if(replay){if(replay.batchId!==input.batchId||(replay.validationMetadata as {requestFingerprint?:string}).requestFingerprint!==requestFingerprint)throw new AdministrativeConfigError('Envio reutilizado com outros dados.');return replay.id;}
 const b=await tx.billingBatch.findUnique({where:{id:input.batchId},include:{contract:{select:{maxXmlBytes:true}}}});if(!b||b.version!==input.expectedVersion)throw new AdministrativeConfigError(CONFIG_CONFLICT);if(!['FECHADO','ENVIADO'].includes(b.state))throw new AdministrativeConfigError('XML exige lote fechado ou enviado preservado.');
 const result=serializeTiss(b);if(result.bytes.length>b.contract.maxXmlBytes)throw new AdministrativeConfigError('XML excede limite atual do contrato. Divida o lote.');
 const started=Date.now(),validation=await validateTissXsd(result.bytes);
 const artifact=await registerValidatedBatchArtifactTx(tx,actorId,{id:randomUUID(),batchId:b.id,contentDigest:b.contentDigest,bytes:result.bytes,requestId:input.requestId,purpose:result.profile.data.mode,generatorVersion:GENERATOR_VERSION,validationReference:'ANS 4.03.00 / libxml2-wasm 0.7.1 / '+validation.schemaDigest,validationMetadata:{requestFingerprint,reason:input.reason,schemaVersion:'4.03.00',schemaDigest:validation.schemaDigest,tissHash:result.hash,profile:result.profile,guideCount:result.guideCount,itemCount:result.itemCount,totalCents:String(result.totalCents),validationMs:Date.now()-started}});return artifact.id;
 },{timeout:30000});
}
export function exactXmlBytes(a:{bytes:Uint8Array;fileHash:string;purpose:string}){if(a.purpose==='LEGADO'||createHash('sha256').update(a.bytes).digest('hex')!==a.fileHash)throw new AdministrativeConfigError('Arquivo legado ou checksum divergente. Download recusado; não regenerar para substituir o original.');return Uint8Array.from(a.bytes);}
