"use server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, AuthorizationError } from "@/modules/auth/dal";
import { normalizeSearch } from "@/modules/pacientes/validation";
import { REPORT_OPTION_KEYS, reportOptionSource, type ReportOptionKey } from "./report-options";
export async function searchAdministrativeReportOptions(key: ReportOptionKey, query: string) {
  try { await assertPermission('administrativo:ler'); } catch (e) { if (e instanceof AuthorizationError) return { error: 'Acesso negado.' }; throw e; }
  if (!REPORT_OPTION_KEYS.includes(key) || typeof query !== 'string' || query.length > 120) return { error: 'Busca inválida.' };
  const term = key === 'patientId' ? normalizeSearch(query.trim()) : query.trim().toLocaleLowerCase('pt-BR');
  const rows = await prisma.$queryRaw<{ id: string; label: string }[]>(Prisma.sql`SELECT id,label FROM (${reportOptionSource(key)}) options WHERE strpos(search,${term})>0 ORDER BY label,id LIMIT 21`);
  return { items: rows.slice(0, 20), hasMore: rows.length > 20 };
}
