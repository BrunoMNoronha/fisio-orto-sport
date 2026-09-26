import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { PAGE_SIZE, normalizeSearch, type ListPatientsParams } from "./validation";

// Seleções explícitas: consultas cadastrais nunca carregam dados clínicos nem relações.
export const PATIENT_LIST_SELECT = {
  id: true,
  fullName: true,
  birthDate: true,
  phone: true,
  status: true,
} as const;

export const PATIENT_DETAIL_SELECT = {
  id: true,
  fullName: true,
  birthDate: true,
  sex: true,
  occupation: true,
  cpf: true,
  phone: true,
  email: true,
  address: true,
  status: true,
  notes: true,
  guardianName: true,
  guardianPhone: true,
  guardianRelationship: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listPatients({ q, status, page }: ListPatientsParams) {
  await requirePermission("pacientes:ler");
  const where = {
    // Sem diferenciar acentos nem maiúsculas: searchName já está normalizado no banco.
    ...(q ? { searchName: { contains: normalizeSearch(q) } } : {}),
    ...(status ? { status } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.patient.findMany({
      where,
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: PATIENT_LIST_SELECT,
    }),
    prisma.patient.count({ where }),
  ]);
  return { items, total, page, pageSize: PAGE_SIZE, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

// `cache`: o layout da ficha e a página consultam o mesmo paciente na mesma requisição.
export const getPatient = cache(async (id: string) => {
  await requirePermission("pacientes:ler");
  if (!id || id.length > 64) return null;
  return prisma.patient.findUnique({ where: { id }, select: PATIENT_DETAIL_SELECT });
});

export type PatientListItem = Awaited<ReturnType<typeof listPatients>>["items"][number];
export type PatientDetail = NonNullable<Awaited<ReturnType<typeof getPatient>>>;
