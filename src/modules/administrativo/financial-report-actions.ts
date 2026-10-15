'use server';
import {Prisma} from '@/generated/prisma/client';
import {prisma} from '@/lib/db';
import {assertPermission,AuthorizationError} from '@/modules/auth/dal';
import {normalizeSearch} from '@/modules/pacientes/validation';
import {FINANCIAL_OPTION_KEYS,financialOptionSource,type FinancialOptionKey} from './financial-report-options';
export async function searchFinancialReportOptions(key:FinancialOptionKey,query:string){
  try{await assertPermission('administrativo:ler');}catch(error){if(error instanceof AuthorizationError)return {error:'Acesso negado.'};throw error;}
  if(!FINANCIAL_OPTION_KEYS.includes(key)||typeof query!=='string'||query.length>120)return {error:'Busca inválida.'};
  const term=key==='patientId'?normalizeSearch(query.trim()):query.trim().toLocaleLowerCase('pt-BR');
  const rows=await prisma.$queryRaw<{id:string;label:string}[]>(Prisma.sql`SELECT id,label FROM (${financialOptionSource(key)}) options WHERE strpos(search,${term})>0 ORDER BY label,id LIMIT 21`);
  return {items:rows.slice(0,20),hasMore:rows.length>20};
}
