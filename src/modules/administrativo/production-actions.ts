"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertPermission, AuthorizationError } from "@/modules/auth/dal";
import { productionSchema } from "./production-validation";
import { saveProduction } from "./production-service";
import { AdministrativeConfigError } from "./service";
export type ProductionActionState = {error:string}|undefined;
export async function saveProductionAction(_previous:ProductionActionState,form:FormData):Promise<ProductionActionState>{
 let actor;try{actor=await assertPermission("administrativo:preparar");}catch(e){if(e instanceof AuthorizationError)return {error:"Acesso negado."};throw e;}
 const parsed=productionSchema.safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:parsed.error.issues[0].message};
 try{await saveProduction(prisma,actor.id,parsed.data);}catch(e){if(e instanceof AdministrativeConfigError)return {error:e.message};console.error('[produção] falha transacional');return {error:"Não foi possível gravar a produção. Nenhuma alteração foi confirmada."};}
 revalidatePath("/administrativo/producao","layout");
 redirect(`/administrativo/producao/${parsed.data.sessionId}`);
}
