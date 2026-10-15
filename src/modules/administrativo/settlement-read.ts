import {Prisma,type PrismaClient} from '@/generated/prisma/client';
import {glosaBalance} from './settlement-service';

export type SettlementFilters={contractId?:string;batchId?:string;page:number;historyPage:number;glosaPage?:number};
export type ReceivableRow={id:string;batchId:string;guideId:string;batchNumber:bigint;guideNumber:bigint;patient:string;procedure:string;billedOn:Date;original:bigint;billed:bigint;adjustment:bigint;received:bigint;analysis:bigint;writtenOff:bigint;open:bigint};
const source=(contractId:string,batchId?:string)=>Prisma.sql`WITH balances AS (
 SELECT r.id,r."batchId",r."guideId",b.number AS "batchNumber",g.number AS "guideNumber",
 coalesce(g.snapshot->'patient'->>'fullName','Identificação preservada') AS patient,
 coalesce(gi.snapshot->'production'->'tariff'->>'name',p.name) AS procedure,r."billedOn",
 r."amountCents"::text AS original,(r."amountCents"::numeric+coalesce(sum(l."billedDelta"::numeric),0))::text AS billed,
 coalesce(sum(l."billedDelta"::numeric),0)::text AS adjustment,coalesce(sum(l."receivedDelta"::numeric),0)::text AS received,
 coalesce(sum(l."analysisDelta"::numeric),0)::text AS analysis,coalesce(sum(l."writtenOffDelta"::numeric),0)::text AS "writtenOff",
 (r."amountCents"::numeric+coalesce(sum(l."billedDelta"::numeric-l."receivedDelta"::numeric-l."analysisDelta"::numeric-l."writtenOffDelta"::numeric),0))::text AS open
 FROM "OperatorReceivable" r JOIN "BillingBatch" b ON b.id=r."batchId" JOIN "BillingGuide" g ON g.id=r."guideId"
 JOIN "ProductionItem" pi ON pi.id=r."productionId" JOIN "BillingProcedure" p ON p.id=pi."procedureId"
 JOIN "BillingGuideItem" gi ON gi."guideId"=r."guideId" AND gi."productionId"=r."productionId" AND gi.active
 LEFT JOIN "OperatorSettlementLine" l ON l."receivableId"=r.id
 WHERE r."contractId"=${contractId} ${batchId?Prisma.sql`AND r."batchId"=${batchId}`:Prisma.empty}
 GROUP BY r.id,b.number,g.number,g.snapshot,gi.snapshot,p.name
)`;
const fields=['original','billed','adjustment','received','analysis','writtenOff','open'] as const;
type RawRow=Omit<ReceivableRow,typeof fields[number]>&Record<typeof fields[number],string>;
export async function readSettlementWorkspace(db:Pick<PrismaClient,'$transaction'>,filters:SettlementFilters){
  return db.$transaction(async tx=>{
    const contract=filters.contractId?await tx.operatorContract.findUnique({where:{id:filters.contractId},select:{id:true,name:true,operator:{select:{name:true}}}}):null;
    if(!contract)return null;
    const base=source(contract.id,filters.batchId);
    const [count]=await tx.$queryRaw<{total:bigint}[]>(Prisma.sql`${base} SELECT count(*)::bigint AS total FROM balances`);
    const pages=Math.max(1,Math.ceil(Number(count.total)/20)),page=Math.min(filters.page,pages);
    const raw=await tx.$queryRaw<RawRow[]>(Prisma.sql`${base} SELECT * FROM balances ORDER BY "billedOn",id LIMIT 20 OFFSET ${(page-1)*20}`);
    const rows:ReceivableRow[]=raw.map(row=>({...row,original:BigInt(row.original),billed:BigInt(row.billed),adjustment:BigInt(row.adjustment),received:BigInt(row.received),analysis:BigInt(row.analysis),writtenOff:BigInt(row.writtenOff),open:BigInt(row.open)}));
    const [rawTotal]=await tx.$queryRaw<Record<typeof fields[number],string>[]>(Prisma.sql`${base} SELECT coalesce(sum(original::numeric),0)::text AS original,coalesce(sum(billed::numeric),0)::text AS billed,coalesce(sum(adjustment::numeric),0)::text AS adjustment,coalesce(sum(received::numeric),0)::text AS received,coalesce(sum(analysis::numeric),0)::text AS analysis,coalesce(sum("writtenOff"::numeric),0)::text AS "writtenOff",coalesce(sum(open::numeric),0)::text AS open FROM balances`);
    const totals=Object.fromEntries(fields.map(field=>[field,BigInt(rawTotal[field])])) as Record<typeof fields[number],bigint>;
    const glosaWhere={receivableId:{in:rows.map(row=>row.id)},settlement:{kind:'GLOSAR'}};
    const glosaCount=await tx.operatorSettlementLine.count({where:glosaWhere}),glosaPages=Math.max(1,Math.ceil(glosaCount/20)),glosaPage=Math.min(filters.glosaPage??1,glosaPages);
    const roots=await tx.operatorSettlementLine.findMany({where:glosaWhere,select:{id:true},orderBy:{id:'asc'},take:20,skip:(glosaPage-1)*20});
    const glosas=[];
    for(const root of roots){const g=await glosaBalance(tx,root.id);if(g)glosas.push({id:g.id,receivableId:g.receivableId,code:g.code,original:g.analysisDelta,analysis:g.analysis,writtenOff:g.writtenOff,state:g.state,effectiveOn:g.settlement.effectiveOn});}
    // Histórico tem paginação própria e sempre abrange o contrato; não é posição histórica de corte.
    const historyCount=await tx.operatorSettlement.count({where:{contractId:contract.id}}),historyPages=Math.max(1,Math.ceil(historyCount/20)),historyPage=Math.min(filters.historyPage,historyPages);
    const history=await tx.operatorSettlement.findMany({where:{contractId:contract.id},select:{id:true,kind:true,effectiveOn:true,createdAt:true,reference:true,reason:true,amountCents:true,reversesId:true,reversedBy:{select:{id:true}},actor:{select:{name:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:20,skip:(historyPage-1)*20});
    return {contract,rows,totals,total:count.total,page,pages,glosas,glosaPage,glosaPages,history,historyPage,historyPages,queriedAt:new Date()};
  },{isolationLevel:'RepeatableRead',timeout:60000});
}
