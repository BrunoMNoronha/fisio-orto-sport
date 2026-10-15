import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { z } from "zod";
import { catalogFilters } from "./validation";
import { normalizeSearch } from "@/modules/pacientes/validation";
import { readGuideSourcesTx } from "./guide-service";
export async function listGuides(raw: unknown) {
  await requirePermission('administrativo:ler'); const parsed = catalogFilters.safeParse(raw); if (!parsed.success) return null; const { q, page } = parsed.data;
  const where = q ? { coverage: { patient: { searchName: { contains: normalizeSearch(q) } } } } : {};
  return prisma.$transaction(async tx => { const total = await tx.billingGuide.count({ where }), pages = Math.max(1, Math.ceil(total / 20)), current = Math.min(page, pages); const items = await tx.billingGuide.findMany({ where, select: { id: true, number: true, month: true, state: true, totalCents: true, coverage: { select: { beneficiaryName: true, contract: { select: { name: true } } } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 20, skip: (current - 1) * 20 }); return { items, total, page: current, pages }; }, { isolationLevel: 'RepeatableRead' });
}
export async function getGuideEditor(id?: string, coverageId?: string, month?: string) {
  const actor = await requirePermission(id ? 'administrativo:ler' : 'administrativo:preparar'); const clinicalAllowed = can(actor.role, 'clinico:gerir');
  if (month && !/^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$/.test(month)) return null;
  if (id && !z.uuid().safeParse(id).success || coverageId && !z.uuid().safeParse(coverageId).success) return null;
  return prisma.$transaction(async tx => {
    const guide = id ? await tx.billingGuide.findUnique({ where: { id }, select: { id: true, number: true, contractId: true, coverageId: true, authorizationId: true, month: true, state: true, requesterId: true, requestedOn: true, characterCode: true, attendanceCode: true, regimeCode: true, accidentCode: true, clinicalConfirmed: true, ...(clinicalAllowed ? { clinicalIndication: true } : {}), snapshot: true, sourceDigest: true, pending: true, totalCents: true, version: true, createdAt: true } }) : null; if (id && !guide) return null;
    const cvId = guide?.coverageId ?? coverageId;
    const coverage = cvId ? await tx.beneficiaryCoverage.findUnique({ where: { id: cvId }, select: { id: true, beneficiaryName: true, contractId: true, contract: { select: { name: true, maxItems: true } }, patient: { select: { fullName: true } } } }) : null; if (cvId && !coverage) return null;
    const links = guide ? await tx.billingGuideItem.findMany({ where: { guideId: id, active: true }, select: { id: true, productionId: true, snapshot: true, production: { select: { state: true, version: true, executionOn: true, quantity: true, amountCents: true, procedure: { select: { code: true, name: true } }, session: { select: { professionalNameSnapshot: true } } } } }, orderBy: { id: 'asc' } }) : [];
    const candidates = coverage && (!guide || guide.state === 'RASCUNHO') ? await tx.productionItem.findMany({ where: { coverageId: coverage.id, state: 'APTO', ...((guide?.month ?? month) ? { executionOn: { gte: new Date((guide?.month ?? month) + '-01T00:00:00Z'), lt: new Date(Date.UTC(Number((guide?.month ?? month)!.slice(0, 4)), Number((guide?.month ?? month)!.slice(5, 7)), 1)) } } : {}), guideItems: { none: { active: true } } }, select: { id: true, executionOn: true, quantity: true, amountCents: true, procedure: { select: { code: true, name: true } }, session: { select: { professionalNameSnapshot: true } }, use: { select: { item: { select: { authorizationId: true } } } } }, take: 101, orderBy: [{ executionOn: 'asc' }, { id: 'asc' }] }) : [];
    const authorizations = coverage ? await tx.benefitAuthorization.findMany({ where: { coverageId: coverage.id }, select: { id: true, number: true, active: true }, orderBy: { number: 'asc' }, take: 101 }) : [];
    const requesters = await tx.billingProfessional.findMany({ where: { active: true, purpose: { in: ['SOLICITANTE', 'AMBOS'] } }, select: { id: true, name: true }, take: 101, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    const changes = guide ? await tx.guideChange.findMany({ where: { guideId: id }, select: { id: true, version: true, reason: true, createdAt: true, actor: { select: { name: true } } }, orderBy: { version: 'desc' }, take: 21 }) : [];
    const profile = coverage ? await tx.guideProfile.findFirst({ where: { contractId: coverage.contractId }, select: { id: true, version: true, reference: true, rules: true }, orderBy: { version: 'desc' } }) : null;
    // Revalidação atual não substitui o snapshot. Conteúdo clínico não é entregue à Recepção.
    let currentPending = guide?.pending ?? []; let stale = false;
    if (guide && guide.state !== 'EM_LOTE' && guide.state !== 'CANCELADA') {
      const full = await tx.billingGuide.findUniqueOrThrow({ where: { id: guide.id } }); const current = await readGuideSourcesTx(tx, full); currentPending = current.pending; stale = current.sourceDigest !== guide.sourceDigest;
    }
    return { guide, coverage, links, candidates: candidates.slice(0, 100), authorizations: authorizations.slice(0, 100), requesters: requesters.slice(0, 100), changes: changes.slice(0, 20), profile, currentPending, stale, clinicalAllowed, configAllowed: can(actor.role, 'administrativo:configurar'), limited: [candidates, authorizations, requesters].some(x => x.length > 100), historyLimited: changes.length > 20, selectedMonth: guide?.month ?? month ?? '' };
  }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
}
export async function getGuideProfile(contractId: string) { await requirePermission('administrativo:configurar'); if (!z.uuid().safeParse(contractId).success) return null; const contract = await prisma.operatorContract.findUnique({ where: { id: contractId }, select: { id: true, name: true } }); if (!contract) return null; const profile = await prisma.guideProfile.findFirst({ where: { contractId }, orderBy: { version: 'desc' }, select: { id: true, version: true, rules: true, reference: true } }); return { contract, profile }; }
