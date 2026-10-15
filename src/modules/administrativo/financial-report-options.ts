import {Prisma} from '@/generated/prisma/client';
import {reportOptionSource} from './report-options';
import type {FinancialOptionKey} from './financial-report-fields';
export {FINANCIAL_OPTION_LABELS,FINANCIAL_OPTION_KEYS,type FinancialOptionKey} from './financial-report-fields';
export function financialOptionSource(key:FinancialOptionKey):Prisma.Sql{
  if(key==='batchId')return Prisma.sql`SELECT b.id,o.name||' / '||c.name||' / lote '||b.number::text AS label,lower(o.name||' '||c.name||' '||b.number::text) AS search FROM "BillingBatch" b JOIN "OperatorContract" c ON c.id=b."contractId" JOIN "HealthOperator" o ON o.id=c."operatorId" WHERE b.state IN ('FECHADO','ENVIADO')`;
  if(key==='guideId')return Prisma.sql`SELECT g.id,c.name||' / guia '||g.number::text||' / '||coalesce(g.snapshot->'patient'->>'fullName','Identificação preservada') AS label,lower(c.name||' '||g.number::text||' '||coalesce(g.snapshot->'patient'->>'fullName','')) AS search FROM "BillingGuide" g JOIN "OperatorContract" c ON c.id=g."contractId" WHERE EXISTS(SELECT 1 FROM "OperatorReceivable" r WHERE r."guideId"=g.id)`;
  return reportOptionSource(key);
}
