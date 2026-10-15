import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { catalogFilters, CATALOG_PAGE_SIZE } from "./validation";
import { readEligibility, type EligibilityInput } from "./eligibility";
import { normalizeSearch } from "@/modules/pacientes/validation";
import { readCoverageContext,readAuthorizationContext } from "./beneficiary-context";
const changes = { take: 10, orderBy: { version: "desc" as const }, select: { version: true, reason: true, snapshot: true, createdAt: true, actor: { select: { name: true } } } };
const patient = { id: true, fullName: true, status: true } as const;
const contract = { id: true, name: true, active: true, operator: { select: { name: true, active: true } } } as const;
export async function listBeneficiaryPatients(raw: unknown) {
  await requirePermission("administrativo:ler");
  const parsed = catalogFilters.safeParse(raw);
  if (!parsed.success) return null;
  const { q, page } = parsed.data;
  const where = q ? { searchName: { contains: normalizeSearch(q) } } : {};
  return prisma.$transaction(async (tx) => {
    const total = await tx.patient.count({ where }), pages = Math.max(1,Math.ceil(total/CATALOG_PAGE_SIZE)), current = Math.min(page,pages);
    const items = await tx.patient.findMany({ where, take: CATALOG_PAGE_SIZE, skip: (current-1)*CATALOG_PAGE_SIZE, orderBy: [{ fullName: "asc" },{ id: "asc" }], select: patient });
    return { total, pages, page: current, items };
  }, { isolationLevel: "RepeatableRead" });
}
export async function getBeneficiary(patientId: string, rawPage?: unknown) {
  await requirePermission("administrativo:ler");
  const parsed = catalogFilters.shape.page.safeParse(rawPage);
  if (typeof patientId !== "string" || !parsed.success) return null;
  return prisma.$transaction(async (tx) => {
    const item = await tx.patient.findUnique({ where: { id: patientId }, select: patient });
    if (!item) return null;
    const total = await tx.beneficiaryCoverage.count({ where: { patientId } }), pages = Math.max(1,Math.ceil(total/CATALOG_PAGE_SIZE)), page = Math.min(parsed.data,pages);
    const coverages = await tx.beneficiaryCoverage.findMany({ where: { patientId }, take: CATALOG_PAGE_SIZE, skip: (page-1)*CATALOG_PAGE_SIZE,
      orderBy: [{ startsOn: "desc" },{ id: "asc" }], select: { id: true, cardNumber: true, startsOn: true, endsOn: true, active: true, contract: { select: contract } } });
    return { ...item, coverages, pages, page };
  }, { isolationLevel: "RepeatableRead" });
}
export async function listBeneficiaryContracts(raw: unknown) {
  await requirePermission("administrativo:preparar");
  const parsed = catalogFilters.safeParse(raw); if (!parsed.success) return null;
  const { q, page } = parsed.data;
  const where = { active: true, operator: { active: true }, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { operator: { name: { contains: q, mode: "insensitive" as const } } }] } : {}) };
  return prisma.$transaction(async (tx) => {
    const total = await tx.operatorContract.count({ where }), pages = Math.max(1,Math.ceil(total/CATALOG_PAGE_SIZE)), current = Math.min(page,pages);
    const items = await tx.operatorContract.findMany({ where, take: CATALOG_PAGE_SIZE, skip: (current-1)*CATALOG_PAGE_SIZE, orderBy: [{ name: "asc" },{ id: "asc" }], select: contract });
    return { items, total, pages, page: current };
  }, { isolationLevel: "RepeatableRead" });
}
export async function getBeneficiaryContract(id: string) {
  await requirePermission("administrativo:preparar");
  if (typeof id !== "string") return null;
  return prisma.operatorContract.findUnique({ where: { id }, select: contract });
}
export async function getCoverage(id: string, rawPage?: unknown) {
  await requirePermission("administrativo:ler");
  const parsed = catalogFilters.shape.page.safeParse(rawPage);
  if (typeof id !== "string" || !parsed.success) return null;
  return prisma.$transaction(async (tx) => {
    const item = await readCoverageContext(tx,id);
    if (!item) return null;
    const history = await tx.beneficiaryChange.findMany({where:{coverageId:id},...changes});
    const total = await tx.benefitAuthorization.count({ where: { coverageId: id } }), pages = Math.max(1,Math.ceil(total/CATALOG_PAGE_SIZE)), page = Math.min(parsed.data,pages);
    const authorizations = await tx.benefitAuthorization.findMany({ where: { coverageId: id }, take: CATALOG_PAGE_SIZE, skip: (page-1)*CATALOG_PAGE_SIZE,
      orderBy: [{ startsOn: "desc" },{ id: "asc" }], select: { id: true, number: true, active: true, startsOn: true, endsOn: true } });
    return { ...item, changes:history, authorizations, page, pages };
  }, { isolationLevel: "RepeatableRead" });
}
export async function getAuthorization(id: string, rawPage?: unknown) {
  await requirePermission("administrativo:ler");
  const parsed = catalogFilters.shape.page.safeParse(rawPage);
  if (typeof id !== "string" || !parsed.success) return null;
  return prisma.$transaction(async (tx) => {
    const item = await readAuthorizationContext(tx,id);
    if (!item) return null;
    const history = await tx.beneficiaryChange.findMany({where:{authorizationId:id},...changes});
    const total = await tx.authorizationItem.count({ where: { authorizationId: id } }), pages = Math.max(1,Math.ceil(total/CATALOG_PAGE_SIZE)), page = Math.min(parsed.data,pages);
    const items = await tx.authorizationItem.findMany({ where: { authorizationId: id }, take: CATALOG_PAGE_SIZE, skip: (page-1)*CATALOG_PAGE_SIZE,
      orderBy: [{ procedureId: "asc" },{ id: "asc" }], include: { procedure: { select: { code: true, name: true } } } });
    const used = await tx.authorizationUse.groupBy({ by: ["itemId"], where: { itemId: { in: items.map((v) => v.id) } }, _sum: { quantity: true } });
    return { ...item, changes:history, page, pages, items: items.map((i) => { const consumed = used.find((u) => u.itemId === i.id)?._sum.quantity ?? 0;
      return { ...i, consumed, available: i.authorizedQuantity-consumed }; }) };
  }, { isolationLevel: "RepeatableRead" });
}
export async function getAuthorizationItem(id: string) {
  await requirePermission("administrativo:ler");
  return prisma.$transaction(async (tx) => {
    const item = await tx.authorizationItem.findUnique({ where: { id } });
    if (!item) return null;
    const authorization=await readAuthorizationContext(tx,item.authorizationId);
    const procedure=await tx.billingProcedure.findUnique({where:{id:item.procedureId},select:{name:true,code:true}});
    if(!authorization||!procedure)return null;
    const history=await tx.beneficiaryChange.findMany({where:{itemId:id},...changes});
    const uses=await tx.authorizationUse.findMany({where:{itemId:id},take:10,orderBy:{createdAt:"desc"},select:{id:true,quantity:true,executionOn:true,reason:true,createdAt:true,reversesId:true}});
    const used = await tx.authorizationUse.aggregate({ where: { itemId: id }, _sum: { quantity: true } });
    return { ...item, authorization,procedure,changes:history,uses,consumed: used._sum.quantity ?? 0, available: item.authorizedQuantity-(used._sum.quantity ?? 0) };
  }, { isolationLevel: "RepeatableRead" });
}
export async function listAuthorizationProcedures(contractId: string, raw: unknown) {
  await requirePermission("administrativo:preparar");
  const parsed = catalogFilters.safeParse(raw); if (!parsed.success) return null;
  const { q, page } = parsed.data;
  const where = { contractId, active: true, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } },{ code: { contains: q, mode: "insensitive" as const } }] } : {}) };
  return prisma.$transaction(async (tx) => {
    const total = await tx.billingProcedure.count({ where }), pages = Math.max(1,Math.ceil(total/CATALOG_PAGE_SIZE)), current = Math.min(page,pages);
    const items = await tx.billingProcedure.findMany({ where, take: CATALOG_PAGE_SIZE, skip: (current-1)*CATALOG_PAGE_SIZE,
      orderBy: [{ name: "asc" },{ id: "asc" }], select: { id: true, code: true, name: true } });
    return { items, total, pages, page: current };
  }, { isolationLevel: "RepeatableRead" });
}
export async function getAuthorizationProcedure(id: string) {
  await requirePermission("administrativo:preparar");
  if (typeof id !== "string") return null;
  return prisma.billingProcedure.findUnique({ where: { id }, select: { id: true, code: true, name: true, contractId: true, active: true } });
}
export async function getProcedureRules(procedureId: string) {
  await requirePermission("administrativo:configurar");
  return prisma.procedureAuthorizationRule.findMany({ where: { procedureId }, orderBy: { version: "desc" }, take: 10,
    select: { id: true, version: true, mode: true, reference: true, reason: true, createdAt: true, actor: { select: { name: true } } } });
}
export async function checkEligibility(input: EligibilityInput) {
  await requirePermission("administrativo:ler");
  if (typeof input.executionOn !== "string" || typeof input.coverageId !== "string" || typeof input.patientId !== "string" || typeof input.procedureId !== "string") return { status: "ENTRADA_INVALIDA" as const };
  return readEligibility(prisma,input);
}
