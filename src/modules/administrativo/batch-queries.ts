import "server-only";
import {prisma} from "@/lib/db";
import {requirePermission} from "@/modules/auth/dal";
import {can} from "@/modules/auth/permissions";
import {z} from "zod";
import {batchListFilters,batchPageFilter,batchParams} from "./batch-validation";
import {readBatchReport} from "./batch-read";
import {AdministrativeConfigError} from "./service";
export async function listBatches(raw:unknown){await requirePermission('administrativo:ler');const parsed=batchListFilters.safeParse(batchParams(raw));if(!parsed.success)return null;const {page,...where}=parsed.data;return prisma.$transaction(async tx=>{const total=await tx.billingBatch.count({where}),pages=Math.max(1,Math.ceil(total/20)),current=Math.min(page,pages);const items=await tx.billingBatch.findMany({where,select:{id:true,number:true,state:true,tissVersion:true,closedAt:true,totalCents:true,contract:{select:{name:true,operator:{select:{name:true}}}}},orderBy:[{createdAt:'desc'},{id:'asc'}],take:20,skip:(current-1)*20});return {items,total,page:current,pages,filters:parsed.data};},{isolationLevel:'RepeatableRead'});}
export async function getBatchReport(id:string,raw:unknown={},all=false){await requirePermission('administrativo:ler');const parsed=batchPageFilter.safeParse(batchParams(raw));if(!z.uuid().safeParse(id).success||!parsed.success)return {report:null,error:'Identificador ou página inválidos.'};try{const report=await readBatchReport(prisma,id,parsed.data.page,all);return {report,error:report?.error??(report?null:'Lote não encontrado.')};}catch(e){if(e instanceof AdministrativeConfigError)return {report:null,error:e.message};throw e;}}
export async function getBatchComposition(id?:string,contractId?:string){const actor=await requirePermission('administrativo:preparar');if(id&&!z.uuid().safeParse(id).success||contractId&&!z.uuid().safeParse(contractId).success)return null;return prisma.$transaction(async tx=>{
 const batch=id?await tx.billingBatch.findUnique({where:{id},select:{id:true,contractId:true,tissVersion:true,state:true,version:true}}):null;if(id&&!batch)return null;const selectedId=batch?.contractId??contractId;
 const contract=selectedId?await tx.operatorContract.findUnique({where:{id:selectedId},select:{id:true,name:true,tissVersion:true,maxGuides:true,maxItems:true,active:true,operator:{select:{name:true}}}}):null;if(selectedId&&!contract)return null;
 const links=batch?await tx.batchGuide.findMany({where:{batchId:id,active:true},select:{guide:{select:{id:true,number:true,month:true,state:true,totalCents:true,snapshot:true}}},orderBy:{guideId:'asc'}}):[];
 const changes=batch?await tx.batchChange.findMany({where:{batchId:id},select:{id:true,version:true,reason:true,createdAt:true,actor:{select:{name:true}}},orderBy:{version:'desc'},take:21}):[];
 const candidates=contract&&(!batch||batch.state==='ABERTO')?await tx.billingGuide.findMany({where:{contractId:contract.id,state:'APTA',batches:{none:{active:true}}},select:{id:true,number:true,month:true,state:true,totalCents:true,snapshot:true},orderBy:[{month:'asc'},{id:'asc'}],take:101}):[];
 // Nunca transferir snapshot bruto/indicação clínica para o editor cliente.
 const option=(g:(typeof candidates)[number])=>{const s=g.snapshot as {patient?:{fullName?:string};profile?:{id?:string;version?:number};contract?:{tissVersion?:string}};return {id:g.id,number:String(g.number),month:g.month,state:g.state,totalCents:g.totalCents,patient:s.patient?.fullName??'Identificação pendente',profileKey:s.profile?String(s.profile.id)+':'+String(s.profile.version):'PENDENTE',tissVersion:s.contract?.tissVersion??''};};
 return {batch,contract,changes:changes.slice(0,20),historyLimited:changes.length>20,guides:links.map(l=>option(l.guide)),candidates:candidates.slice(0,100).map(option),limited:candidates.length>100,canClose:can(actor.role,'administrativo:fechar')};
 },{isolationLevel:'RepeatableRead'});}
