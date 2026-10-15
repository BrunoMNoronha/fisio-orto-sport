import 'server-only';
import {prisma} from '@/lib/db';
import {requirePermission} from '@/modules/auth/dal';
import {parseFinancialReportFilters,type FinancialReportKind} from './financial-report-validation';
import {readFinancialReport} from './financial-report-read';
export async function getFinancialReport(kind:FinancialReportKind,raw:unknown,mode:'page'|'all'='page'){
  await requirePermission('administrativo:ler');
  const parsed=parseFinancialReportFilters(kind,raw);
  if(!parsed.filters)return {error:parsed.error,report:null};
  const report=await readFinancialReport(prisma,kind,parsed.filters,mode);
  return {error:report.error,report};
}
