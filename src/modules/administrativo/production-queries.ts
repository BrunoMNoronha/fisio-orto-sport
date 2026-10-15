import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { catalogFilters } from "./validation";
import { normalizeSearch } from "@/modules/pacientes/validation";
// Projeções administrativas explícitas: nunca evolução, diagnóstico ou plano terapêutico.
export const productionSessionSelect = {id:true,patientId:true,occurredAt:true,status:true,version:true,professionalNameSnapshot:true,patient:{select:{fullName:true,status:true}}} as const;
export async function listProduction(raw:unknown, pending=false){
 await requirePermission("administrativo:ler");
 const parsed=catalogFilters.safeParse(raw);if(!parsed.success)return null;
 const {q,page}=parsed.data;
 const where={...(q?{patient:{searchName:{contains:normalizeSearch(q)}}}:{}),...(pending?{productionItems:{some:{OR:[{state:"PENDENTE"},{adjustmentPending:true}]}}}:{status:"VALIDO" as const})};
 return prisma.$transaction(async tx=>{
 const total=await tx.treatmentSession.count({where}),pages=Math.max(1,Math.ceil(total/20)),current=Math.min(page,pages);
 const items=await tx.treatmentSession.findMany({where,select:productionSessionSelect,orderBy:[{occurredAt:"desc"},{id:"asc"}],take:20,skip:(current-1)*20});return {items,total,page:current,pages};
 },{isolationLevel:"RepeatableRead"});
}
export async function getProductionSession(id:string){
 await requirePermission("administrativo:preparar");
 return prisma.$transaction(async tx=>{
 const session=await tx.treatmentSession.findUnique({where:{id},select:productionSessionSelect});if(!session)return null;
 const items=await tx.productionItem.findMany({where:{sessionId:id},orderBy:[{createdAt:"asc"},{id:"asc"}],take:101,include:{procedure:{select:{code:true,name:true}},changes:{take:10,orderBy:{version:"desc"},select:{version:true,reason:true,createdAt:true,actor:{select:{name:true}}}}}});
 const coverages=await tx.beneficiaryCoverage.findMany({where:{patientId:session.patientId},take:101,orderBy:{id:"asc"},select:{id:true,cardNumber:true,active:true,contractId:true,contract:{select:{name:true}}}});
 const procedures=await tx.billingProcedure.findMany({where:{contractId:{in:coverages.map(c=>c.contractId)}},take:101,orderBy:{id:"asc"},select:{id:true,code:true,name:true,contractId:true}});
 const authorizationItems=await tx.authorizationItem.findMany({where:{authorization:{coverage:{patientId:session.patientId}}},take:101,orderBy:{id:"asc"},select:{id:true,procedureId:true,authorization:{select:{number:true,coverageId:true}}}});
 return {session,items:items.slice(0,100),coverages:coverages.slice(0,100),procedures:procedures.slice(0,100),authorizationItems:authorizationItems.slice(0,100),limited:[items,coverages,procedures,authorizationItems].some(x=>x.length>100)};
 },{isolationLevel:"RepeatableRead"});
}
