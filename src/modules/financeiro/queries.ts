import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { normalizeSearch } from "@/modules/pacientes/validation";
import { PAGE_SIZE, isPlausibleId, patientLabel, type ListChargesParams } from "./validation";

// Seleções explícitas: do paciente só id, nome e situação; nada clínico nem outros dados cadastrais.
const PATIENT_SELECT = { id: true, fullName: true, status: true } as const;
const LINKED_CHARGE_SELECT = { id: true, description: true, amountCents: true, dueDate: true, status: true } as const;

export const CHARGE_LIST_SELECT = {
  id: true,
  description: true,
  amountCents: true,
  dueDate: true,
  status: true,
  replacesChargeId: true,
  patient: { select: PATIENT_SELECT },
} as const;

export const CHARGE_DETAIL_SELECT = {
  id: true,
  description: true,
  amountCents: true,
  dueDate: true,
  status: true,
  createdAt: true,
  cancelledAt: true,
  cancelReason: true,
  patient: { select: PATIENT_SELECT },
  createdBy: { select: { name: true } },
  cancelledBy: { select: { name: true } },
  replaces: { select: LINKED_CHARGE_SELECT },
  replacedBy: { select: LINKED_CHARGE_SELECT },
} as const;

// Ordem estável: vencimento mais recente primeiro, depois lançamento e id (índices da migração).
const ORDER = [{ dueDate: "desc" }, { createdAt: "desc" }, { id: "desc" }] as const;

export async function listCharges({ q, status, patientId, page }: ListChargesParams) {
  await requirePermission("financeiro:ler");
  const where = {
    ...(status ? { status } : {}),
    ...(patientId ? { patientId } : {}),
    // Nome do paciente sem diferenciar acentos nem maiúsculas (mesma searchName da lista de pacientes).
    ...(q ? { patient: { searchName: { contains: normalizeSearch(q) } } } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.charge.findMany({
      where,
      orderBy: [...ORDER],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: CHARGE_LIST_SELECT,
    }),
    prisma.charge.count({ where }),
  ]);
  return { items, total, page, pageSize: PAGE_SIZE, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getCharge(id: string) {
  await requirePermission("financeiro:ler");
  if (!isPlausibleId(id)) return null;
  return prisma.charge.findUnique({ where: { id }, select: CHARGE_DETAIL_SELECT });
}

// Paciente do filtro da lista (`?patientId=`): só o nome, para o rótulo.
export async function getChargePatientFilter(id: string | undefined) {
  await requirePermission("financeiro:ler");
  if (!isPlausibleId(id)) return null;
  return prisma.patient.findUnique({ where: { id }, select: PATIENT_SELECT });
}

export type ChargeListItem = Awaited<ReturnType<typeof listCharges>>["items"][number];
export type ChargeDetail = NonNullable<Awaited<ReturnType<typeof getCharge>>>;

// Pré-seleção do paciente no formulário (`?patientId=`), ativo ou inativo.
export async function getChargePatientOption(id: string | undefined) {
  await requirePermission("financeiro:gerir");
  if (!isPlausibleId(id)) return null;
  const patient = await prisma.patient.findUnique({ where: { id }, select: PATIENT_SELECT });
  return patient ? { id: patient.id, label: patientLabel(patient) } : null;
}
