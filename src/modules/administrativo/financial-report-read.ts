import {Prisma,type PrismaClient} from '@/generated/prisma/client';
import {CONTRACT_DEFAULTS} from './contract-defaults';
import {FINANCIAL_OPTION_KEYS,financialOptionSource} from './financial-report-options';
import type {FinancialReportFilters,FinancialReportKind} from './financial-report-validation';

export const FINANCIAL_AMOUNTS=['batchValue','original','adjustment','billed','received','open','analysis','writtenOff','periodReceived','periodGlosed'] as const;
type AmountKey=typeof FINANCIAL_AMOUNTS[number];
export type FinancialAmounts=Record<AmountKey,bigint>;
export type FinancialReportRow=FinancialAmounts&{id:string;operatorId:string;operator:string;contractId:string;contract:string;batchId:string;batchNumber:bigint;guideId:string|null;guideNumber:bigint|null;productionId:string|null;patient:string;procedure:string;professional:string;date:string;lastDate:string;state:string;itemCount:bigint;guideCount:bigint};
export type FinancialReportTotal=FinancialAmounts&{operatorId:string;operator:string;contractId:string;contract:string;rowCount:bigint;itemCount:bigint};
export type FinancialReport={kind:FinancialReportKind;filters:FinancialReportFilters;items:FinancialReportRow[];totals:FinancialReportTotal[];total:number;page:number;pages:number;limit:number;generatedAt:Date;labels:Record<string,string>;error:string|null};
const dateFilter=(column:Prisma.Sql,f:FinancialReportFilters)=>Prisma.sql`${f.start?Prisma.sql`AND ${column}>=${f.start}::date`:Prisma.empty} ${f.end?Prisma.sql`AND ${column}<=${f.end}::date`:Prisma.empty}`;

function balances(f:FinancialReportFilters){return Prisma.sql`
 WITH movement AS (
 SELECT "receivableId",sum("billedDelta"::numeric) adjustment,sum("receivedDelta"::numeric) received,sum("analysisDelta"::numeric) analysis,sum("writtenOffDelta"::numeric) writtenoff
 FROM "OperatorSettlementLine" GROUP BY "receivableId"
 ), receipts AS (
 SELECT l."receivableId",min(e."effectiveOn") first,max(e."effectiveOn") last,sum(l."receivedDelta"::numeric) amount
 FROM "OperatorSettlementLine" l JOIN "OperatorSettlement" e ON e.id=l."settlementId"
 WHERE e.kind IN ('RECEBER','SUBSTITUIR') AND NOT l."reversalPart" AND NOT EXISTS(SELECT 1 FROM "OperatorSettlement" rev WHERE rev."reversesId"=e.id)
 ${f.axis==='recebimento'?dateFilter(Prisma.sql`e."effectiveOn"`,f):Prisma.empty} GROUP BY l."receivableId"
 ), glosas AS (
 SELECT l."receivableId",min(e."effectiveOn") first,max(e."effectiveOn") last,sum(l."analysisDelta"::numeric) amount
 FROM "OperatorSettlementLine" l JOIN "OperatorSettlement" e ON e.id=l."settlementId" WHERE e.kind='GLOSAR'
 ${f.axis==='glosa'?dateFilter(Prisma.sql`e."effectiveOn"`,f):Prisma.empty} GROUP BY l."receivableId"
 ), item_facts AS (
 SELECT r.id,r."contractId",r."batchId",r."guideId",r."productionId",c."operatorId",o.name AS operator,c.name AS contract,b.number AS "batchNumber",g.number AS "guideNumber",
 coalesce(g.snapshot->'patient'->>'fullName',pt."fullName") AS patient,pt.id AS "patientId",pr.id AS "procedureId",
 coalesce(gi.snapshot->'production'->'tariff'->>'name',pr.name) AS procedure,coalesce(gi.snapshot->'production'->>'professionalName',p.snapshot->>'professionalName','') AS professional,
 coalesce(gi.snapshot->'production'->>'professionalId',p.snapshot->>'professionalId') AS "professionalId",
 p."executionOn",(b."closedAt" AT TIME ZONE 'America/Sao_Paulo')::date AS "closedOn",r."billedOn",c."maxExportRows" AS "exportLimit",
 0::numeric AS "batchValue",r."amountCents"::numeric AS original,coalesce(m.adjustment,0) AS adjustment,
 r."amountCents"::numeric+coalesce(m.adjustment,0) AS billed,coalesce(m.received,0) AS received,coalesce(m.analysis,0) AS analysis,coalesce(m.writtenoff,0) AS "writtenOff",
 r."amountCents"::numeric+coalesce(m.adjustment,0)-coalesce(m.received,0)-coalesce(m.analysis,0)-coalesce(m.writtenoff,0) AS open,
 coalesce(rc.amount,0) AS "periodReceived",coalesce(gl.amount,0) AS "periodGlosed",rc.first AS "receiptFirst",rc.last AS "receiptLast",gl.first AS "glosaFirst",gl.last AS "glosaLast"
 FROM "OperatorReceivable" r JOIN "OperatorContract" c ON c.id=r."contractId" JOIN "HealthOperator" o ON o.id=c."operatorId"
 JOIN "BillingBatch" b ON b.id=r."batchId" JOIN "BillingGuide" g ON g.id=r."guideId" JOIN "ProductionItem" p ON p.id=r."productionId"
 JOIN "TreatmentSession" s ON s.id=p."sessionId" JOIN "Patient" pt ON pt.id=s."patientId" JOIN "BillingProcedure" pr ON pr.id=p."procedureId"
 JOIN "BillingGuideItem" gi ON gi."guideId"=r."guideId" AND gi."productionId"=r."productionId" AND gi.active
 LEFT JOIN movement m ON m."receivableId"=r.id LEFT JOIN receipts rc ON rc."receivableId"=r.id LEFT JOIN glosas gl ON gl."receivableId"=r.id
 )`;
}
function itemSource(f:FinancialReportFilters){
  const dates={execucao:['executionOn','executionOn'],fechamento:['closedOn','closedOn'],envio:['billedOn','billedOn'],recebimento:['receiptFirst','receiptLast'],glosa:['glosaFirst','glosaLast']}[f.axis];
  const first=Prisma.raw('"'+dates[0]+'"'),last=Prisma.raw('"'+dates[1]+'"');
  const predicates:Prisma.Sql[]=[Prisma.sql`${first} IS NOT NULL`];
  for(const key of ['operatorId','contractId','batchId','guideId','patientId','procedureId','professionalId'] as const)if(f[key])predicates.push(Prisma.sql`${Prisma.raw('"'+key+'"')}=${f[key]}`);
  const balance={COM_ABERTO:Prisma.sql`open>0`,COM_ANALISE:Prisma.sql`analysis>0`,COM_BAIXA:Prisma.sql`"writtenOff">0`,COM_RECEBIDO:Prisma.sql`received>0`,SEM_RECUPERAVEL:Prisma.sql`open=0 AND analysis=0`};
  if(f.balance)predicates.push(balance[f.balance]);
  return Prisma.sql`${balances(f)}, source AS (
 SELECT *,${first}::text AS date,${last}::text AS "lastDate",'ENVIADO'::text AS state,1::bigint AS "itemCount",1::bigint AS "guideCount"
 FROM item_facts WHERE ${Prisma.join(predicates,' AND ')} ${['recebimento','glosa'].includes(f.axis)?Prisma.empty:dateFilter(first,f)}
 )`;
}
function batchSource(f:FinancialReportFilters){
  const date=f.axis==='fechamento'?Prisma.sql`(b."closedAt" AT TIME ZONE 'America/Sao_Paulo')::date`:Prisma.sql`s."sentOn"`;
  const predicates:Prisma.Sql[]=[Prisma.sql`b.state IN ('FECHADO','ENVIADO')`,Prisma.sql`${date} IS NOT NULL`];
  if(f.operatorId)predicates.push(Prisma.sql`c."operatorId"=${f.operatorId}`);
  if(f.contractId)predicates.push(Prisma.sql`c.id=${f.contractId}`);
  if(f.batchId)predicates.push(Prisma.sql`b.id=${f.batchId}`);
  if(f.state)predicates.push(Prisma.sql`b.state=${f.state}`);
  return Prisma.sql`${balances(f)}, batch_amounts AS (SELECT "batchId",sum(original) original,sum(adjustment) adjustment,sum(billed) billed,sum(received) received,sum(open) open,sum(analysis) analysis,sum("writtenOff") "writtenOff" FROM item_facts GROUP BY "batchId"), source AS (
 SELECT b.id,c."operatorId",o.name AS operator,c.id AS "contractId",c.name AS contract,b.id AS "batchId",b.number AS "batchNumber",
 NULL::text AS "guideId",NULL::bigint AS "guideNumber",NULL::text AS "productionId",''::text AS patient,''::text AS procedure,''::text AS professional,
 ${date}::text AS date,${date}::text AS "lastDate",b.state,c."maxExportRows" AS "exportLimit",
 jsonb_array_length(b.snapshot->'guides')::bigint AS "guideCount",(SELECT coalesce(sum(jsonb_array_length(g->'items')),0)::bigint FROM jsonb_array_elements(b.snapshot->'guides') g) AS "itemCount",
 b."totalCents"::numeric AS "batchValue",coalesce(a.original,0) original,coalesce(a.adjustment,0) adjustment,coalesce(a.billed,0) billed,coalesce(a.received,0) received,coalesce(a.open,0) open,coalesce(a.analysis,0) analysis,coalesce(a."writtenOff",0) AS "writtenOff",0::numeric AS "periodReceived",0::numeric AS "periodGlosed"
 FROM "BillingBatch" b JOIN "OperatorContract" c ON c.id=b."contractId" JOIN "HealthOperator" o ON o.id=c."operatorId"
 LEFT JOIN "BatchSend" s ON s."batchId"=b.id AND s."correctsId" IS NULL LEFT JOIN batch_amounts a ON a."batchId"=b.id
 WHERE ${Prisma.join(predicates,' AND ')} ${dateFilter(date,f)}
 )`;
}
const moneyColumns=Prisma.join(FINANCIAL_AMOUNTS.map(key=>Prisma.sql`${Prisma.raw('"'+key+'"')}::text AS ${Prisma.raw('"'+key+'"')}`),',');
const moneyTotals=Prisma.join(FINANCIAL_AMOUNTS.map(key=>Prisma.sql`coalesce(sum(${Prisma.raw('"'+key+'"')}),0)::text AS ${Prisma.raw('"'+key+'"')}`),',');
type RawAmounts=Record<AmountKey,string>;
function amounts<T extends RawAmounts>(row:T):Omit<T,AmountKey>&FinancialAmounts{
  const {batchValue,original,adjustment,billed,received,open,analysis,writtenOff,periodReceived,periodGlosed,...rest}=row;
  return {...rest,batchValue:BigInt(batchValue),original:BigInt(original),adjustment:BigInt(adjustment),billed:BigInt(billed),received:BigInt(received),open:BigInt(open),analysis:BigInt(analysis),writtenOff:BigInt(writtenOff),periodReceived:BigInt(periodReceived),periodGlosed:BigInt(periodGlosed)};
}
export async function readFinancialReport(db:Pick<PrismaClient,'$transaction'>,kind:FinancialReportKind,filters:FinancialReportFilters,mode:'page'|'all'='page',now=new Date()):Promise<FinancialReport>{
  return db.$transaction(async tx=>{
    const base=kind==='faturamento'?batchSource(filters):itemSource(filters);
    const [count]=await tx.$queryRaw<{total:bigint;limit:number|null}[]>(Prisma.sql`${base} SELECT count(*)::bigint AS total,min("exportLimit")::integer AS limit FROM source`);
    const total=Number(count.total),limit=count.limit??CONTRACT_DEFAULTS.maxExportRows,pages=Math.max(1,Math.ceil(total/20)),page=Math.min(filters.page,pages);
    const result:FinancialReport={kind,filters,items:[],totals:[],total,limit,page,pages,generatedAt:now,labels:{},error:null};
    if(mode==='all'&&total>limit){result.error=`O filtro contém ${total} ${kind==='faturamento'?'lotes':'itens'} e excede o limite de ${limit} linhas por exportação/impressão. Refine os filtros ou revise o limite do contrato. Nenhum resultado foi truncado.`;return result;}
    const totals=await tx.$queryRaw<(Omit<FinancialReportTotal,AmountKey>&RawAmounts)[]>(Prisma.sql`${base} SELECT "operatorId",operator,"contractId",contract,count(*)::bigint AS "rowCount",sum("itemCount")::bigint AS "itemCount",${moneyTotals} FROM source GROUP BY "operatorId",operator,"contractId",contract ORDER BY operator,"operatorId",contract,"contractId"`);
    result.totals=totals.map(amounts);
    const rows=await tx.$queryRaw<(Omit<FinancialReportRow,AmountKey>&RawAmounts)[]>(Prisma.sql`${base} SELECT id,"operatorId",operator,"contractId",contract,"batchId","batchNumber","guideId","guideNumber","productionId",patient,procedure,professional,date,"lastDate",state,"itemCount","guideCount",${moneyColumns} FROM source ORDER BY date,id LIMIT ${mode==='all'?limit:20} OFFSET ${mode==='all'?0:(page-1)*20}`);
    result.items=rows.map(amounts);
    for(const key of FINANCIAL_OPTION_KEYS)if(filters[key]){const [option]=await tx.$queryRaw<{label:string}[]>(Prisma.sql`SELECT label FROM (${financialOptionSource(key)}) options WHERE id=${filters[key]}`);result.labels[key]=option?.label??'Registro inexistente (nenhum resultado)';}
    return result;
  },{isolationLevel:'RepeatableRead',timeout:60000});
}
