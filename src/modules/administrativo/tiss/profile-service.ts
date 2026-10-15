import {createHash} from "node:crypto";
import type {PrismaClient} from "@/generated/prisma/client";
import type {z} from "zod";
import {tissProfileSchema} from "./profile";
import {lockBeneficiary} from "../beneficiary-service";
import {AdministrativeConfigError,CONFIG_CONFLICT} from "../service";
export async function saveTissProfile(db:Pick<PrismaClient,'$transaction'>,actorId:string,input:z.output<typeof tissProfileSchema>){
 const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 return db.$transaction(async tx=>{await lockBeneficiary(tx);const replay=await tx.tissProfile.findUnique({where:{requestId:input.requestId}});if(replay){if(replay.fingerprint!==fingerprint)throw new AdministrativeConfigError('Envio reutilizado com outros dados.');return replay.id;}
 const latest=await tx.tissProfile.findFirst({where:{contractId:input.contractId},orderBy:{version:'desc'}});if((latest?.version??0)!==input.expectedVersion)throw new AdministrativeConfigError(CONFIG_CONFLICT);
 const c=await tx.operatorContract.findUnique({where:{id:input.contractId},select:{tissVersion:true}});if(!c||c.tissVersion?.replace(/^0/,'')!==input.data.schemaVersion)throw new AdministrativeConfigError('Versão TISS do contrato difere do schema selecionado. Configure o contrato.');
 return(await tx.tissProfile.create({data:{id:input.id,contractId:input.contractId,version:input.expectedVersion+1,data:input.data,actorId,reason:input.reason,requestId:input.requestId,fingerprint}})).id;});
}
