"use server";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {prisma} from "@/lib/db";
import {assertPermission,AuthorizationError} from "@/modules/auth/dal";
import {batchSchema} from "./batch-validation";
import {saveBatch} from "./batch-service";
import {AdministrativeConfigError} from "./service";
export type BatchActionState={error:string}|undefined;
export async function saveBatchAction(_previous:BatchActionState,form:FormData):Promise<BatchActionState>{
 let actor;try{actor=await assertPermission(form.get('operation')==='SALVAR'?'administrativo:preparar':'administrativo:fechar');}catch(e){if(e instanceof AuthorizationError)return {error:'Acesso negado.'};throw e;}
 for(const key of form.keys())if(key!=='guideIds'&&form.getAll(key).length!==1)return {error:'Campo repetido. Recarregue o formulário.'};
 const raw=Object.fromEntries([...form].filter(([k])=>!k.startsWith('$ACTION_'))),parsed=batchSchema.safeParse({...raw,guideIds:form.getAll('guideIds')});if(!parsed.success)return {error:parsed.error.issues[0].message};
 let id:string;try{id=await saveBatch(prisma,actor.id,parsed.data);}catch(e){if(e instanceof AdministrativeConfigError)return {error:e.message};console.error('[lotes] falha transacional');return {error:'Não foi possível gravar o lote. Nenhuma alteração foi confirmada.'};}
 revalidatePath('/administrativo/lotes','layout');revalidatePath('/administrativo/guias','layout');revalidatePath('/administrativo/producao','layout');redirect('/administrativo/lotes/'+id);
}
