import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { catalogFilters, CATALOG_PAGE_SIZE } from "./validation";

// O painel contém só configurações administrativas, sem incluir pacientes/prontuário.
export async function listOperatorConfigurations(raw: unknown) {
  await requirePermission("administrativo:configurar");
  const filters = catalogFilters.safeParse(raw);
  if (!filters.success) return { error: "Filtros inválidos. Corrija a busca ou a página.", items: [], total: 0, page: 1, pages: 1 };
  const { q, page } = filters.data;
  const where = q ? { name: { contains: q, mode: "insensitive" as const } } : {};
  return prisma.$transaction(async (tx) => {
    const total = await tx.healthOperator.count({ where });
    const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
    const currentPage = Math.min(page, pages);
    const items = await tx.healthOperator.findMany({ where, skip: (currentPage - 1) * CATALOG_PAGE_SIZE, take: CATALOG_PAGE_SIZE,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, registrationAns: true, active: true, _count: { select: { contracts: true } } },
    });
    return { error: null, items, total, page: currentPage, pages };
  }, { isolationLevel: "RepeatableRead" });
}

export async function getOperatorConfiguration(id: string, rawPage?: unknown) {
  await requirePermission("administrativo:configurar");
  const parsedPage = catalogFilters.shape.page.safeParse(rawPage);
  if (!parsedPage.success) return null;
  return prisma.$transaction(async (tx) => {
  const operator = await tx.healthOperator.findUnique({ where: { id }, select: {
    id: true, name: true, registrationAns: true, active: true, version: true,
    _count: { select: { contracts: true } },
    changes: { orderBy: { version: "desc" }, take: 10, select: {
      version: true, reason: true, snapshot: true, createdAt: true, actor: { select: { name: true } },
    } },
  } });
  if (!operator) return null;
  const contractPages = Math.max(1, Math.ceil(operator._count.contracts / CATALOG_PAGE_SIZE));
  const contractPage = Math.min(parsedPage.data, contractPages);
  const contracts = await tx.operatorContract.findMany({ where: { operatorId: id },
    orderBy: [{ name: "asc" }, { id: "asc" }], skip: (contractPage - 1) * CATALOG_PAGE_SIZE, take: CATALOG_PAGE_SIZE,
    select: { id: true, name: true, tissVersion: true, active: true },
  });
  return { ...operator, contracts, contractPage, contractPages };
  }, { isolationLevel: "RepeatableRead" });
}

export async function getContractConfiguration(id: string) {
  await requirePermission("administrativo:configurar");
  if (typeof id !== "string") return null;
  return prisma.operatorContract.findUnique({ where: { id }, select: {
    id: true, operatorId: true, name: true, providerCode: true, cnes: true, tissVersion: true, manualReference: true, homologationChannel: true, monthlySessions: true, closingIntervalDays: true, maxGuides: true, maxItems: true, maxXmlBytes: true, maxExportRows: true, active: true, version: true,
    operator: { select: { name: true, active: true, registrationAns: true } },
    changes: { orderBy: { version: "desc" }, take: 10, select: {
      version: true, reason: true, snapshot: true, createdAt: true, actor: { select: { name: true } },
    } },
  } });
}
