import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, BillingGuide } from "@/generated/prisma/client";
import { lockBeneficiary } from "./beneficiary-service";
import { revalidateProductionTx } from "./production-service";
import { AdministrativeConfigError, CONFIG_CONFLICT } from "./service";
import { guideRulesSchema, guideProfileSchema, type GuideInput, type GuidePending } from "./guide-validation";
import type { z } from "zod";
type Tx = Prisma.TransactionClient;
const json = (v: unknown): Prisma.InputJsonObject => JSON.parse(JSON.stringify(v, (_k, x) => typeof x === 'bigint' ? String(x) : x));
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(json(v))).digest('hex');
const fail = (message: string): never => { throw new AdministrativeConfigError(message); };
const professionalSelect = { id: true, userId: true, name: true, purpose: true, councilCode: true, councilNumber: true, councilState: true, occupationCode: true, active: true, version: true } as const;
export async function saveGuideProfile(db: Pick<PrismaClient, '$transaction'>, actorId: string, input: z.output<typeof guideProfileSchema>) {
  const fingerprint = digest(input);
  return db.$transaction(async tx => {
    await lockBeneficiary(tx); const replay = await tx.guideProfile.findUnique({ where: { requestId: input.requestId } }); if (replay) { if (replay.fingerprint !== fingerprint) fail('Envio reutilizado com outros dados.'); return replay.id; }
    const current = await tx.guideProfile.findFirst({ where: { contractId: input.contractId }, orderBy: { version: 'desc' } }); if ((current?.version ?? 0) !== input.expectedVersion) fail(CONFIG_CONFLICT);
    return (await tx.guideProfile.create({ data: { id: input.id, contractId: input.contractId, version: input.expectedVersion + 1, rules: input.rules, reference: input.reference, reason: input.reason, requestId: input.requestId, fingerprint, actorId } })).id;
  });
}
async function lockGuideContext(tx: Tx, coverageId: string, guideId: string, productionIds: string[]) {
  const cv = await tx.beneficiaryCoverage.findUnique({ where: { id: coverageId }, select: { patientId: true } }); if (!cv) fail('Cobertura inexistente.');
  await tx.$queryRaw`SELECT id FROM "Patient" WHERE id=${cv!.patientId} FOR UPDATE`;
  await lockBeneficiary(tx);
  const rows = await tx.productionItem.findMany({ where: { OR: [{ id: { in: productionIds } }, { guideItems: { some: { guideId, active: true } } }] }, select: { sessionId: true, session: { select: { patientId: true } } }, orderBy: { sessionId: 'asc' } });
  if (rows.some(r => r.session.patientId !== cv!.patientId)) fail('Produção de outro beneficiário.');
  for (const sessionId of [...new Set(rows.map(r => r.sessionId))]) await tx.$queryRaw`SELECT id FROM "TreatmentSession" WHERE id=${sessionId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "BillingGuide" WHERE id=${guideId} FOR UPDATE`;
}
export async function readGuideSourcesTx(tx: Tx, g: BillingGuide) {
  const pending: GuidePending[] = []; const need = (ok: unknown, field: string, message: string) => { if (!ok) pending.push({ field, message }); };
  const cv = await tx.beneficiaryCoverage.findUniqueOrThrow({ where: { id: g.coverageId }, include: { patient: { select: { id: true, fullName: true, birthDate: true, status: true } }, contract: { include: { operator: true } } } });
  const contract = cv.contract, operator = contract.operator;
  const clinic = await tx.clinicSettings.findUnique({ where: { id: 1 }, select: { legalName: true, cnpj: true, version: true } });
  const profile = await tx.guideProfile.findFirst({ where: { contractId: g.contractId }, orderBy: { version: 'desc' } });
  const parsed = guideRulesSchema.safeParse(profile?.rules), rules = parsed.success ? parsed.data : null;
  const requester = g.requesterId ? await tx.billingProfessional.findUnique({ where: { id: g.requesterId }, select: professionalSelect }) : null;
  const authorization = g.authorizationId ? await tx.benefitAuthorization.findUnique({ where: { id: g.authorizationId }, select: { id: true, coverageId: true, contractId: true, number: true, accessCode: true, startsOn: true, endsOn: true, active: true, version: true } }) : null;
  const links = await tx.billingGuideItem.findMany({ where: { guideId: g.id, active: true }, orderBy: { productionId: 'asc' }, include: { production: { select: { id: true, sessionId: true, coverageId: true, procedureId: true, useId: true, quantity: true, endTime: true, executionOn: true, state: true, version: true, amountCents: true, snapshot: true, adjustmentPending: true, session: { select: { id: true, professionalId: true, status: true, version: true } } } } } });
  need(profile && rules, 'perfil', 'ADMIN deve configurar o perfil de campos/códigos do contrato.');
  need(contract.active && operator.active && cv.active && cv.patient.status === 'ATIVO', 'cobertura', 'Paciente, cobertura, contrato e operadora devem estar ativos.');
  need(operator.registrationAns, 'operadora.registrationAns', 'Informe registro ANS em Configurações.'); need(contract.providerCode, 'contrato.providerCode', 'Informe código do prestador no contrato.'); need(contract.tissVersion, 'contrato.tissVersion', 'Informe versão TISS do contrato.'); need(contract.manualReference, 'contrato.manualReference', 'Informe a referência do manual do contrato.'); need(clinic?.legalName, 'clinica.legalName', 'Informe razão social da clínica.'); need(clinic?.cnpj, 'clinica.cnpj', 'Informe CNPJ da clínica.');
  if (rules?.requireCnes) need(contract.cnes, 'contrato.cnes', 'CNES exigido pelo perfil.');
  const checkProfessional = (p: typeof requester, field: string, purpose: string) => { need(p && p.active && [purpose, 'AMBOS'].includes(p.purpose), field, 'Selecione cadastro faturável ativo com atuação compatível.'); for (const key of ['councilCode', 'councilNumber', 'councilState', 'occupationCode'] as const) need(p?.[key], field + '.' + key, 'Preencha conselho, número, UF e CBO no cadastro faturável.'); };
  checkProfessional(requester, 'solicitante', 'SOLICITANTE'); need(g.requestedOn, 'requestedOn', 'Informe a data real da solicitação.');
  for (const [field, key] of [['characterCode', 'characterCodes'], ['attendanceCode', 'attendanceCodes'], ['regimeCode', 'regimeCodes'], ['accidentCode', 'accidentCodes']] as const) { need(rules?.[key].length, 'perfil.' + key, 'Configure os códigos aceitos pelo manual.'); need(g[field] && rules?.[key].includes(g[field]), field, 'Selecione um código permitido pelo perfil do contrato.'); }
  if (rules?.requireClinicalIndication) need(g.clinicalIndication && g.clinicalConfirmed, 'clinicalIndication', 'Indicação para faturamento exige confirmação explícita por ADMIN/Fisioterapeuta.');
  need(links.length, 'itens', 'Associe ao menos um item de produção conferido.'); need(links.length <= contract.maxItems, 'itens.limite', 'Quantidade de itens excede o limite do contrato.'); if (!rules?.allowMultipleItems) need(links.length <= 1, 'itens.agrupamento', 'Perfil permite somente um item por guia.');
  if (g.authorizationId) need(authorization?.active && authorization.coverageId === g.coverageId && authorization.contractId === g.contractId, 'autorizacao', 'Autorização incompatível ou cancelada.');
  let total = BigInt(0); const items = [];
  for (const link of links) {
    const p = link.production; const field = 'itens.' + p.id;
    const verified = await revalidateProductionTx(tx, p.id); need(verified.status === 'OK', field + '.producao', 'Reconfira a produção: ' + verified.status);
    need(p.coverageId === g.coverageId && p.executionOn.toISOString().slice(0, 7) === g.month, field + '.grupo', 'Cobertura ou competência incompatível.');
    const snap = p.snapshot as { eligibility?: { authorizationId?: string }; tariff?: { amountCents?: number } };
    need((snap.eligibility?.authorizationId ?? null) === g.authorizationId, field + '.autorizacao', 'Autorização diferente da guia.');
    need(g.requestedOn && g.requestedOn <= p.executionOn, field + '.requestedOn', 'Solicitação não pode ser posterior à execução.');
    const executor = await tx.billingProfessional.findUnique({ where: { userId: p.session.professionalId }, select: professionalSelect }); checkProfessional(executor, field + '.executante', 'EXECUTANTE');
    if (rules?.requireEndTime) need(p.endTime, field + '.endTime', 'Informe hora final real na produção e confira novamente.');
    const unit = snap.tariff?.amountCents; need(Number.isSafeInteger(unit) && unit! > 0 && p.amountCents === BigInt(p.quantity) * BigInt(unit ?? 0), field + '.valor', 'Quantidade/valor não reconciliam com a tarifa conferida.');
    const currentProcedure = await tx.billingProcedure.findUnique({ where: { id: p.procedureId }, select: { version: true } });
    const currentRule = await tx.procedureAuthorizationRule.findFirst({ where: { procedureId: p.procedureId }, orderBy: { version: 'desc' }, select: { id: true, version: true, mode: true } });
    const currentUse = p.useId ? await tx.authorizationUse.findUnique({ where: { id: p.useId }, select: { item: { select: { id: true, version: true, authorizedQuantity: true, active: true } } } }) : null;
    total += p.amountCents ?? BigInt(0); items.push({ id: link.id, productionId: p.id, productionVersion: p.version, sessionId: p.sessionId, sessionVersion: p.session.version, executionOn: p.executionOn, endTime: p.endTime, quantity: p.quantity, unitCents: String(unit ?? 0), factorNumerator: 1, factorDenominator: 1, totalCents: String(p.amountCents ?? 0), production: p.snapshot, executor, sourceVersions: { procedure: currentProcedure, rule: currentRule, authorizationItem: currentUse?.item ?? null } });
  }
  const snapshot = json({ coverage: { id: cv.id, version: cv.version, beneficiaryName: cv.beneficiaryName, cardNumber: cv.cardNumber, planName: cv.planName, startsOn: cv.startsOn, endsOn: cv.endsOn }, patient: cv.patient, contract: { id: contract.id, name: contract.name, version: contract.version, providerCode: contract.providerCode, cnes: contract.cnes, tissVersion: contract.tissVersion, manualReference: contract.manualReference, maxItems: contract.maxItems }, operator: { id: operator.id, name: operator.name, registrationAns: operator.registrationAns, version: operator.version }, clinic, profile: profile ? { id: profile.id, version: profile.version, rules: profile.rules, reference: profile.reference } : null, authorization, requester, month: g.month, requestedOn: g.requestedOn, characterCode: g.characterCode, attendanceCode: g.attendanceCode, regimeCode: g.regimeCode, accidentCode: g.accidentCode, clinicalIndicationHash: digest({ text: g.clinicalIndication, confirmed: g.clinicalConfirmed }), items });
  return { pending, snapshot, sourceDigest: digest(snapshot), total, items };
}
export async function recordGuideChange(tx: Tx, id: string, actorId: string, reason: string, requestId: string, fingerprint: string) {
  await tx.$executeRaw`INSERT INTO "GuideChange"(id,"guideId",version,"actorId",reason,"requestId",fingerprint,snapshot) SELECT ${randomUUID()},g.id,g.version,${actorId},${reason},${requestId},${fingerprint},jsonb_build_object('guide',to_jsonb(g),'items',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]'::jsonb) FROM "BillingGuideItem" i WHERE i."guideId"=g.id)) FROM "BillingGuide" g WHERE g.id=${id}`;
}
export async function saveGuide(db: Pick<PrismaClient, '$transaction'>, actorId: string, input: GuideInput, clinicalAllowed = false) {
  if (!clinicalAllowed && (input.clinicalIndication !== undefined || input.clinicalConfirmed !== undefined)) fail('Somente perfil clínico pode confirmar indicação.');
  const fingerprint = digest(input);
  try {
    return await db.$transaction(async tx => {
      await lockGuideContext(tx, input.coverageId, input.id, input.productionIds);
      const replay = await tx.guideChange.findUnique({ where: { requestId: input.requestId } }); if (replay) { if (replay.fingerprint !== fingerprint) fail('Envio reutilizado com outros dados.'); return replay.guideId; }
      const current = await tx.billingGuide.findUnique({ where: { id: input.id } }); if ((current?.version ?? 0) !== input.expectedVersion) fail(CONFIG_CONFLICT);
      if (current && ['EM_LOTE', 'CANCELADA'].includes(current.state)) fail('Guia preservada; não pode ser editada neste estado.');
      if (current && (current.coverageId !== input.coverageId || current.authorizationId !== input.authorizationId || current.month !== input.month)) fail('Agrupamento é imutável. Cancele e monte outra guia.');
      if (current?.state === 'APTA' && !['DEVOLVER', 'CANCELAR'].includes(input.operation)) fail('Devolva a guia para correção antes de editar/conferir.');
      if (!current && !['SALVAR', 'CONFERIR'].includes(input.operation)) fail('Crie o rascunho primeiro.');
      const cv = await tx.beneficiaryCoverage.findUniqueOrThrow({ where: { id: input.coverageId }, select: { contractId: true } });
      const values = { requesterId: input.requesterId, requestedOn: input.requestedOn, characterCode: input.characterCode, attendanceCode: input.attendanceCode, regimeCode: input.regimeCode, accidentCode: input.accidentCode, ...(clinicalAllowed ? { clinicalIndication: input.clinicalIndication ?? current?.clinicalIndication ?? '', clinicalConfirmed: input.clinicalConfirmed ?? current?.clinicalConfirmed ?? false } : {}) };
      if (current) await tx.billingGuide.update({ where: { id: input.id }, data: { ...(input.operation === 'SALVAR' || input.operation === 'CONFERIR' ? values : {}), state: input.operation === 'CANCELAR' ? 'CANCELADA' : 'RASCUNHO', version: { increment: 1 } } });
      else { const sequence = await tx.guideSequence.upsert({ where: { contractId: cv.contractId }, create: { contractId: cv.contractId, lastNumber: BigInt(1) }, update: { lastNumber: { increment: 1 } } }); await tx.billingGuide.create({ data: { id: input.id, coverageId: input.coverageId, contractId: cv.contractId, authorizationId: input.authorizationId, number: sequence.lastNumber, month: input.month, ...values, snapshot: {}, sourceDigest: '', pending: [] } }); }
      const oldLinks = await tx.billingGuideItem.findMany({ where: { guideId: input.id, active: true } });
      if (input.operation === 'SALVAR' || input.operation === 'CONFERIR') {
        for (const l of oldLinks) if (!input.productionIds.includes(l.productionId)) await tx.billingGuideItem.update({ where: { id: l.id }, data: { active: false } });
        for (const productionId of input.productionIds) if (!oldLinks.some(l => l.productionId === productionId)) await tx.billingGuideItem.create({ data: { guideId: input.id, productionId, snapshot: {} } });
      } else if (input.operation === 'CANCELAR') for (const l of oldLinks) await tx.billingGuideItem.update({ where: { id: l.id }, data: { active: false } });
      if (['SALVAR', 'CONFERIR'].includes(input.operation)) {
        const guide = await tx.billingGuide.findUniqueOrThrow({ where: { id: input.id } }); const result = await readGuideSourcesTx(tx, guide);
        if (result.total > BigInt("9223372036854775807")) fail("O total excede a capacidade em centavos. Divida os itens em guias menores; nenhuma alteração foi confirmada.");
        for (const item of result.items) await tx.billingGuideItem.update({ where: { id: item.id }, data: { snapshot: json(item) } });
        await tx.billingGuide.update({ where: { id: input.id }, data: { pending: result.pending, snapshot: result.snapshot, sourceDigest: result.sourceDigest, totalCents: result.total, state: input.operation === 'CONFERIR' && !result.pending.length ? 'APTA' : 'RASCUNHO' } });
      }
      await recordGuideChange(tx, input.id, actorId, input.reason, input.requestId, fingerprint); return input.id;
    }, { timeout: 30000 });
  } catch (e) { if (e instanceof AdministrativeConfigError) throw e; if (typeof e === 'object' && e && 'code' in e && e.code === 'P2002') fail('Um item já pertence a outra guia ativa ou o envio foi reutilizado.'); throw e; }
}
// Consumidor #102 deve chamar nesta mesma transação antes de fechar o lote. Não consome de novo.
export async function revalidateGuideTx(tx: Tx, id: string) { const g = await tx.billingGuide.findUnique({ where: { id } }); if (!g) return { status: 'INEXISTENTE' as const }; await lockGuideContext(tx, g.coverageId, g.id, []); const fresh = await tx.billingGuide.findUniqueOrThrow({ where: { id } }); if (fresh.state !== 'APTA') return { status: 'NAO_APTA' as const }; const r = await readGuideSourcesTx(tx, fresh); return r.pending.length || r.sourceDigest !== fresh.sourceDigest ? { status: 'FONTES_ALTERADAS' as const, pending: r.pending } : { status: 'OK' as const, guide: fresh }; }
