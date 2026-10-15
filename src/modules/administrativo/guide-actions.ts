"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertPermission, AuthorizationError } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { guideSchema, guideProfileSchema } from "./guide-validation";
import { saveGuide, saveGuideProfile } from "./guide-service";
import { AdministrativeConfigError } from "./service";
export type GuideActionState = { error: string } | undefined;
function fields(form: FormData, repeated?: string) { for (const key of form.keys()) if (key !== repeated && form.getAll(key).length > 1) throw new AdministrativeConfigError('Campo repetido. Recarregue o formulário.'); return Object.fromEntries([...form].filter(([k]) => !k.startsWith('$ACTION_'))); }
export async function saveGuideAction(_previous: GuideActionState, form: FormData): Promise<GuideActionState> {
  let actor; try { actor = await assertPermission('administrativo:preparar'); } catch (e) { if (e instanceof AuthorizationError) return { error: 'Acesso negado.' }; throw e; }
  let id: string;
  try {
    const raw = fields(form, 'productionIds');
    if (raw.clinicalConfirmed !== undefined && !['true', 'false'].includes(String(raw.clinicalConfirmed))) return { error: 'Confirmação clínica inválida.' }; if (!can(actor.role, 'clinico:gerir') && ('clinicalIndication' in raw || 'clinicalConfirmed' in raw)) return { error: 'Somente perfil clínico pode confirmar indicação.' };
    const input = guideSchema.safeParse({ ...raw, productionIds: form.getAll('productionIds'), ...(raw.clinicalConfirmed !== undefined ? { clinicalConfirmed: raw.clinicalConfirmed === 'true' } : {}) }); if (!input.success) return { error: input.error.issues[0].message };
    id = await saveGuide(prisma, actor.id, input.data, can(actor.role, 'clinico:gerir'));
  } catch (e) { if (e instanceof AdministrativeConfigError) return { error: e.message }; console.error('[guias] falha transacional'); return { error: 'Não foi possível gravar a guia. Nenhuma alteração foi confirmada.' }; }
  revalidatePath('/administrativo/guias', 'layout'); redirect('/administrativo/guias/' + id);
}
export async function saveGuideProfileAction(_previous: GuideActionState, form: FormData): Promise<GuideActionState> {
  let actor; try { actor = await assertPermission('administrativo:configurar'); } catch (e) { if (e instanceof AuthorizationError) return { error: 'Acesso negado.' }; throw e; }
  let contractId: string;
  try {
    const raw = fields(form); if (['requireCnes', 'requireEndTime', 'requireClinicalIndication', 'allowMultipleItems'].some(k => !['true', 'false'].includes(String(raw[k])))) return { error: 'Condições do perfil inválidas.' }; const rules = { requireCnes: raw.requireCnes === 'true', requireEndTime: raw.requireEndTime === 'true', requireClinicalIndication: raw.requireClinicalIndication === 'true', allowMultipleItems: raw.allowMultipleItems === 'true', ...Object.fromEntries(['characterCodes', 'attendanceCodes', 'regimeCodes', 'accidentCodes'].map(k => [k, String(raw[k] ?? '').split(',').map(v => v.trim()).filter(Boolean)])) }; const input = guideProfileSchema.safeParse({ id: raw.id, requestId: raw.requestId, expectedVersion: raw.expectedVersion, reason: raw.reason, contractId: raw.contractId, reference: raw.reference, rules }); if (!input.success) return { error: input.error.issues[0].message }; contractId = input.data.contractId; await saveGuideProfile(prisma, actor.id, input.data);
  } catch (e) { if (e instanceof AdministrativeConfigError) return { error: e.message }; console.error('[perfil de guia] falha transacional'); return { error: 'Não foi possível salvar o perfil.' }; }
  revalidatePath('/administrativo/guias', 'layout'); redirect('/configuracoes/perfis-guia/' + contractId);
}
export async function searchGuideCoverages(query: string) {
  try { await assertPermission('administrativo:preparar'); } catch (e) { if (e instanceof AuthorizationError) return { error: 'Acesso negado.' }; throw e; }
  if (typeof query !== 'string' || query.length > 100) return { error: 'Busca inválida.' }; const { normalizeSearch } = await import('@/modules/pacientes/validation');
  const rows = await prisma.beneficiaryCoverage.findMany({ where: { active: true, patient: { searchName: { contains: normalizeSearch(query) } } }, select: { id: true, beneficiaryName: true, contract: { select: { name: true } }, patient: { select: { fullName: true } } }, take: 21, orderBy: [{ beneficiaryName: 'asc' }, { id: 'asc' }] }); return { items: rows.slice(0, 20).map(r => ({ id: r.id, label: r.patient.fullName + ' — ' + r.contract.name + ' — ' + r.beneficiaryName })), hasMore: rows.length > 20 };
}
