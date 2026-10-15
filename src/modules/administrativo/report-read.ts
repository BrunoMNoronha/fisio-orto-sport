import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { REPORT_OPTION_KEYS, reportOptionSource } from "./report-options";
import { CONTRACT_DEFAULTS } from "./contract-defaults";
import type { AdministrativeReportFilters, AdministrativeReportKind } from "./report-validation";
export type AdministrativeReportRow = { id: string; date: string; end: string | null; patient: string; operator: string; contract: string; contractId: string; professional: string; professionalId: string | null; procedure: string; procedureId: string; tableCode: string; code: string; state: string; reason: string; quantity: bigint; authorized: bigint; consumed: bigint; available: bigint; amountCents: bigint | null; sessionId: string | null; coverageId: string; authorizationId: string | null; authorization: string | null; hasPending: boolean };
export type AdministrativeReportTotal = Pick<AdministrativeReportRow, 'operator' | 'contract' | 'contractId' | 'professional' | 'professionalId' | 'procedure' | 'procedureId' | 'tableCode' | 'code' | 'state' | 'hasPending' | 'quantity' | 'authorized' | 'consumed' | 'available' | 'amountCents'> & { count: bigint };
export type ReportMode = 'page' | 'all';
export type AdministrativeReport = { kind: AdministrativeReportKind; filters: AdministrativeReportFilters; items: AdministrativeReportRow[]; totals: AdministrativeReportTotal[]; total: number; page: number; pages: number; limit: number; generatedAt: Date; error: string | null; labels: Record<string, string> };

function productionSource() {
return Prisma.sql`WITH facts AS (
 SELECT p.id,p."executionOn"::text AS date,NULL::text AS "end",pt."fullName" AS patient,o.name AS operator,c.name AS contract,c.id AS "contractId",
 coalesce(p.snapshot->>'professionalName',s."professionalNameSnapshot") AS professional,coalesce(p.snapshot->>'professionalId',s."professionalId") AS "professionalId",
 coalesce(p.snapshot->'tariff'->>'name',pr.name) AS procedure,pr.id AS "procedureId",coalesce(p.snapshot->'tariff'->>'tableCode',pr."tableCode") AS "tableCode",coalesce(p.snapshot->'tariff'->>'code',pr.code) AS code,
 p.state, CASE WHEN p."adjustmentPending" THEN 'Ajuste pendente após alteração clínica; snapshot fechado preservado.'
 WHEN p.state='PENDENTE' THEN p."pendingReason"
 WHEN p.state='APTO' AND (s.status<>'VALIDO' OR s.version<>p."sessionVersion") THEN 'Sessão alterada; devolver e conferir novamente.'
 WHEN p.state='APTO' AND (NOT cv.active OR NOT pr.active OR NOT c.active OR NOT o.active OR pt.status<>'ATIVO') THEN 'Há cadastro inativo; revisar elegibilidade antes do fechamento.'
 WHEN p.state='APTO' AND (p."executionOn"<cv."startsOn" OR (cv."endsOn" IS NOT NULL AND p."executionOn">cv."endsOn")) THEN 'Cobertura fora da vigência na execução.'
 WHEN p.state='APTO' AND p."useId" IS NOT NULL AND (au.id IS NULL OR NOT ai.active OR NOT au.active OR au."startsOn">p."executionOn" OR au."endsOn"<p."executionOn") THEN 'Autorização cancelada ou fora da vigência na execução; devolver e conferir novamente.'
 WHEN p.state='APTO' AND (rule.mode IS NULL OR rule.mode='PENDENTE' OR rule.version IS DISTINCT FROM (p.snapshot->'eligibility'->>'ruleVersion')::integer) THEN 'Regra contratual alterada; devolver e conferir novamente.'
 ELSE '' END AS reason,
 p.quantity::bigint AS quantity,0::bigint AS authorized,0::bigint AS consumed,0::bigint AS available,
 CASE WHEN p.state IN ('APTO','FECHADO','ENVIADO') THEN p."amountCents" ELSE NULL END AS "amountCents",
 p."sessionId",p."coverageId",NULL::text AS "authorizationId",NULL::text AS "authorization",c."maxExportRows" AS "exportLimit",pt.id AS "patientId",o.id AS "operatorId"
 FROM "ProductionItem" p JOIN "TreatmentSession" s ON s.id=p."sessionId" JOIN "Patient" pt ON pt.id=s."patientId"
 JOIN "BeneficiaryCoverage" cv ON cv.id=p."coverageId" JOIN "OperatorContract" c ON c.id=cv."contractId"
 JOIN "HealthOperator" o ON o.id=c."operatorId" JOIN "BillingProcedure" pr ON pr.id=p."procedureId"
 LEFT JOIN "AuthorizationUse" pu ON pu.id=p."useId"
 LEFT JOIN "AuthorizationItem" ai ON ai.id=pu."itemId"
 LEFT JOIN "BenefitAuthorization" au ON au.id=ai."authorizationId"
 LEFT JOIN LATERAL(SELECT r.mode,r.version FROM "ProcedureAuthorizationRule" r WHERE r."procedureId"=pr.id ORDER BY version DESC LIMIT 1) rule ON true
), source AS (SELECT *,reason<>'' AND state<>'INVALIDADO' AS "hasPending" FROM facts)`;
}
function authorizationSource(today: string) {
return Prisma.sql`WITH facts AS (
 SELECT i.id,a."startsOn"::text AS date,a."endsOn"::text AS "end",pt."fullName" AS patient,o.name AS operator,c.name AS contract,c.id AS "contractId",
 ''::text AS professional,NULL::text AS "professionalId",pr.name AS procedure,pr.id AS "procedureId",pr."tableCode",pr.code,
 CASE WHEN NOT(i.active AND a.active AND cv.active AND c.active AND o.active AND pr.active AND pt.status='ATIVO') THEN 'INATIVA'
 WHEN a."endsOn"<${today}::date THEN 'VENCIDA' WHEN a."startsOn">${today}::date THEN 'FUTURA'
 WHEN i."authorizedQuantity"-coalesce(u.used,0)<=0 THEN 'ESGOTADA' ELSE 'AUTORIZADA' END AS state,
 ''::text AS reason,0::bigint AS quantity,i."authorizedQuantity"::bigint AS authorized,coalesce(u.used,0)::bigint AS consumed,(i."authorizedQuantity"-coalesce(u.used,0))::bigint AS available,
 NULL::bigint AS "amountCents",NULL::text AS "sessionId",cv.id AS "coverageId",a.id AS "authorizationId",a.number AS "authorization",c."maxExportRows" AS "exportLimit",pt.id AS "patientId",o.id AS "operatorId"
 FROM "AuthorizationItem" i JOIN "BenefitAuthorization" a ON a.id=i."authorizationId" JOIN "BeneficiaryCoverage" cv ON cv.id=a."coverageId"
 JOIN "Patient" pt ON pt.id=cv."patientId" JOIN "OperatorContract" c ON c.id=i."contractId" JOIN "HealthOperator" o ON o.id=c."operatorId"
 JOIN "BillingProcedure" pr ON pr.id=i."procedureId"
 LEFT JOIN LATERAL(SELECT sum(quantity)::bigint AS used FROM "AuthorizationUse" WHERE "itemId"=i.id) u ON true
), source AS (SELECT *,false AS "hasPending" FROM facts)`;
}
function sourceFilter(kind: AdministrativeReportKind, f: AdministrativeReportFilters) {
  const parts: Prisma.Sql[] = [Prisma.sql`true`];
  for (const [key, column] of [['patientId', 'patientId'], ['operatorId', 'operatorId'], ['contractId', 'contractId'], ['procedureId', 'procedureId'], ['professionalId', 'professionalId'], ['authorizationId', 'authorizationId'], ['state', 'state']] as const) { if (f[key]) parts.push(Prisma.sql`${Prisma.raw('"' + column + '"')}=${f[key]}`); }
  if (f.start) parts.push(kind === 'autorizacoes' ? Prisma.sql`"end"::date>=${f.start}::date` : Prisma.sql`date::date>=${f.start}::date`);
  if (f.end) parts.push(Prisma.sql`date::date<=${f.end}::date`);
  if (kind === 'pendencias') parts.push(Prisma.sql`"hasPending"`);
  return Prisma.join(parts, ' AND ');
}
export async function readAdministrativeReport(db: Pick<PrismaClient, '$transaction'>, kind: AdministrativeReportKind, filters: AdministrativeReportFilters, mode: ReportMode = 'page', now = new Date()): Promise<AdministrativeReport> {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(now);
  return db.$transaction(async tx => {
    const base = kind === 'autorizacoes' ? authorizationSource(today) : productionSource(), where = sourceFilter(kind, filters);
    const [count] = await tx.$queryRaw<{ total: bigint; limit: number | null }[]>(Prisma.sql`${base} SELECT count(*)::bigint AS total,min("exportLimit")::integer AS limit FROM source WHERE ${where}`);
    const total = Number(count.total), limit = count.limit ?? CONTRACT_DEFAULTS.maxExportRows, pages = Math.max(1, Math.ceil(total / 20)), page = Math.min(filters.page, pages);
    const result: AdministrativeReport = { kind, filters, items: [], totals: [], total, page, pages, limit, generatedAt: now, error: null, labels: {} };
    if (mode === 'all' && total > limit) { result.error = `O filtro contém ${total} itens e excede o limite de ${limit} linhas por exportação/impressão. Refine os filtros ou solicite ao administrador a revisão do limite do contrato. Nenhum item foi exportado.`; return result; }
    const totals = await tx.$queryRaw<(Omit<AdministrativeReportTotal, 'quantity' | 'authorized' | 'consumed' | 'available' | 'amountCents'> & { quantity: string; authorized: string; consumed: string; available: string; amountCents: string })[]>(Prisma.sql`${base} SELECT operator,contract,"contractId",professional,"professionalId",procedure,"procedureId","tableCode",code,state,"hasPending",count(*)::bigint AS count,sum(quantity)::text AS quantity,sum(authorized)::text AS authorized,sum(consumed)::text AS consumed,sum(available)::text AS available,coalesce(sum("amountCents"),0)::text AS "amountCents" FROM source WHERE ${where} GROUP BY operator,contract,"contractId",professional,"professionalId",procedure,"procedureId","tableCode",code,state,"hasPending" ORDER BY contract,"contractId",procedure,"procedureId",professional,"professionalId",state,"hasPending"`);
    result.totals = totals.map(t => ({ ...t, quantity: BigInt(t.quantity), authorized: BigInt(t.authorized), consumed: BigInt(t.consumed), available: BigInt(t.available), amountCents: BigInt(t.amountCents) }));
    for (const key of REPORT_OPTION_KEYS) { if (filters[key]) { const [option] = await tx.$queryRaw<{ label: string }[]>(Prisma.sql`SELECT label FROM (${reportOptionSource(key)}) options WHERE id=${filters[key]}`); result.labels[key] = option?.label ?? 'Registro inexistente (nenhum resultado)'; } }
    result.items = await tx.$queryRaw<AdministrativeReportRow[]>(Prisma.sql`${base} SELECT id,date,"end",patient,operator,contract,"contractId",professional,"professionalId",procedure,"procedureId","tableCode",code,state,reason,quantity,authorized,consumed,available,"amountCents","sessionId","coverageId","authorizationId","authorization","hasPending" FROM source WHERE ${where} ORDER BY date,id LIMIT ${mode === 'all' ? limit : 20} OFFSET ${mode === 'all' ? 0 : (page - 1) * 20}`);
    return result;
  }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
}
