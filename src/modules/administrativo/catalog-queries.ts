import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { catalogFilters, CATALOG_PAGE_SIZE } from "./validation";
import { readTariffSnapshot } from "./catalog-read";

const changes = { orderBy: { version: "desc" as const }, take: 10, select: {
  version: true, reason: true, snapshot: true, createdAt: true, actor: { select: { name: true } },
} };
export async function listProcedures(contractId: string, raw: unknown) {
  await requirePermission("administrativo:configurar");
  const filters = catalogFilters.safeParse(raw);
  if (!filters.success) return null;
  const { page, q } = filters.data;
  const where = { contractId, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }] } : {}) };
  return prisma.$transaction(async (tx) => {
    const total = await tx.billingProcedure.count({ where });
    const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE)), current = Math.min(page, pages);
    const items = await tx.billingProcedure.findMany({ where, take: CATALOG_PAGE_SIZE, skip: (current - 1) * CATALOG_PAGE_SIZE,
      orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, tableCode: true, code: true, active: true } });
    return { items, total, page: current, pages };
  }, { isolationLevel: "RepeatableRead" });
}
export async function getProcedure(id: string, rawPage?: unknown) {
  await requirePermission("administrativo:configurar");
  if (typeof id !== "string") return null;
  const parsed = catalogFilters.shape.page.safeParse(rawPage);
  if (!parsed.success) return null;
  return prisma.$transaction(async (tx) => {
    const item = await tx.billingProcedure.findUnique({ where: { id }, include: {
      changes, contract: { select: { id: true, name: true, operatorId: true, active: true, operator: { select: { name: true, active: true } } } },
      _count: { select: { tariffs: true } },
    } });
    if (!item) return null;
    const pages = Math.max(1, Math.ceil(item._count.tariffs / CATALOG_PAGE_SIZE)), page = Math.min(parsed.data, pages);
    const tariffs = await tx.procedureTariff.findMany({ where: { procedureId: id }, take: CATALOG_PAGE_SIZE, skip: (page - 1) * CATALOG_PAGE_SIZE,
      orderBy: [{ startsOn: "desc" }, { id: "asc" }], select: { id: true, amountCents: true, startsOn: true, endsOn: true, active: true } });
    return { ...item, tariffs, page, pages };
  }, { isolationLevel: "RepeatableRead" });
}
export async function getTariff(id: string) {
  await requirePermission("administrativo:configurar");
  return prisma.procedureTariff.findUnique({ where: { id }, include: { changes, procedure: { select: { name: true, code: true } } } });
}
export async function listProfessionals(raw: unknown) {
  await requirePermission("administrativo:configurar");
  const filters = catalogFilters.safeParse(raw);
  if (!filters.success) return null;
  const { page, q } = filters.data;
  const where = q ? { name: { contains: q, mode: "insensitive" as const } } : {};
  return prisma.$transaction(async (tx) => {
    const total = await tx.billingProfessional.count({ where });
    const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE)), current = Math.min(page, pages);
    const items = await tx.billingProfessional.findMany({ where, take: CATALOG_PAGE_SIZE, skip: (current - 1) * CATALOG_PAGE_SIZE,
      orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, purpose: true, active: true, councilCode: true, councilNumber: true, councilState: true, occupationCode: true } });
    return { items, total, page: current, pages };
  }, { isolationLevel: "RepeatableRead" });
}
export async function getProfessional(id: string) {
  await requirePermission("administrativo:configurar");
  return prisma.billingProfessional.findUnique({ where: { id }, include: { changes,
    user: { select: { id: true, name: true, active: true, role: true } },
  } });
}
export async function resolveTariff(contractId: string, procedureId: string, date: string) {
  await requirePermission("administrativo:configurar");
  return readTariffSnapshot(prisma, contractId, procedureId, date);
}
export async function listLinkableUsers(q: unknown) {
  await requirePermission("administrativo:configurar");
  if (typeof q !== "string" || !q.trim() || q.length > 100) return [];
  return prisma.user.findMany({ where: { active: true, role: "FISIOTERAPEUTA", name: { contains: q.trim(), mode: "insensitive" } },
    take: 21, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } });
}
