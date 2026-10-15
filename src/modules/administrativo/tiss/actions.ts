"use server";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {prisma} from "@/lib/db";
import {assertPermission,AuthorizationError} from "@/modules/auth/dal";
import {tissProfileSchema,generateXmlSchema} from "./profile";
import {saveTissProfile} from "./profile-service";
import {generateBatchXml} from "./xml-service";
import {AdministrativeConfigError} from "../service";
export type XmlActionState={error:string}|undefined;
function fields(form:FormData){for(const key of form.keys())if(form.getAll(key).length!==1)throw new AdministrativeConfigError('Campo repetido. Recarregue a página.');return Object.fromEntries([...form].filter(([k])=>!k.startsWith('$ACTION_')));}
export async function saveTissProfileAction(_previous:XmlActionState,form:FormData):Promise<XmlActionState>{let actor;try{actor=await assertPermission('administrativo:configurar');}catch(e){if(e instanceof AuthorizationError)return {error:'Acesso negado.'};throw e;}let contractId:string;
 try{const raw=fields(form);if(['acceptedVersionConfirmed','includeExecutor'].some(k=>!['true','false'].includes(String(raw[k]))))return {error:'Confirmação inválida.'};const executorCodes=Object.fromEntries(Object.entries(raw).filter(([k,v])=>k.startsWith('executorCode.')&&String(v).trim()).map(([k,v])=>[k.slice(13),String(v).trim()]));const known=new Set(['id','requestId','expectedVersion','reason','contractId','schemaVersion','mode','pilotName','manualReference','homologationChannel','acceptedVersionConfirmed','includeExecutor']);if(Object.keys(raw).some(k=>!known.has(k)&&!k.startsWith('executorCode.')))return {error:'Campo desconhecido.'};const input=tissProfileSchema.safeParse({id:raw.id,requestId:raw.requestId,expectedVersion:raw.expectedVersion,reason:raw.reason,contractId:raw.contractId,data:{schemaVersion:raw.schemaVersion,mode:raw.mode,pilotName:raw.pilotName,manualReference:raw.manualReference,homologationChannel:raw.homologationChannel,acceptedVersionConfirmed:raw.acceptedVersionConfirmed==='true',includeExecutor:raw.includeExecutor==='true',executorCodes}});if(!input.success)return {error:input.error.issues[0].message};contractId=input.data.contractId;await saveTissProfile(prisma,actor.id,input.data);
 }catch(e){if(e instanceof AdministrativeConfigError)return {error:e.message};console.error('[perfil XML] falha transacional');return {error:'Não foi possível salvar o perfil XML.'};}
 revalidatePath('/administrativo/lotes','layout');redirect('/configuracoes/perfis-xml/'+contractId);
}
export async function generateBatchXmlAction(_previous:XmlActionState,form:FormData):Promise<XmlActionState>{let actor;try{actor=await assertPermission('administrativo:fechar');}catch(e){if(e instanceof AuthorizationError)return {error:'Acesso negado.'};throw e;}let batchId:string;
 try{const input=generateXmlSchema.safeParse(fields(form));if(!input.success)return {error:input.error.issues[0].message};batchId=input.data.batchId;await generateBatchXml(prisma,actor.id,input.data);
 }catch(e){if(e instanceof AdministrativeConfigError)return {error:e.message};console.error('[XML] falha de geração/persistência');return {error:'Falha de geração ou persistência. Nenhum arquivo parcial foi confirmado.'};}
 revalidatePath('/administrativo/lotes','layout');redirect('/administrativo/lotes/'+batchId);
}
