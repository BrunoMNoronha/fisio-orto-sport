import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { isPlausibleId } from "./validation";

// Toda leitura clínica exige `clinico:ler` aqui, mesmo que a página já tenha checado.
// Toda consulta filtra por patientId: uma versão nunca é lida fora do paciente da URL.

// Versão vigente: maior createdAt, desempate pelo maior id (determinístico).
const CURRENT_FIRST = [{ createdAt: "desc" as const }, { id: "desc" as const }];

export const ANAMNESIS_DETAIL_SELECT = {
  id: true,
  patientId: true,
  assessmentDate: true,
  createdAt: true,
  authorNameSnapshot: true,
  chiefComplaint: true,
  currentIllnessHistory: true,
  personalPathologicalHistory: true,
  surgeries: true,
  currentMedications: true,
  habitsPhysicalActivity: true,
  painIntensity: true,
  painLocation: true,
  painTypes: true,
  functionalLimitations: true,
  patientGoals: true,
  clinicalNotes: true,
} as const;

// Histórico: somente metadados, sem conteúdo clínico.
export const ANAMNESIS_HISTORY_SELECT = {
  id: true,
  assessmentDate: true,
  createdAt: true,
  authorNameSnapshot: true,
} as const;

export async function getCurrentAnamnesis(patientId: string) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId)) return null;
  return prisma.anamnesis.findFirst({
    where: { patientId },
    orderBy: CURRENT_FIRST,
    select: ANAMNESIS_DETAIL_SELECT,
  });
}

export async function getAnamnesisVersion(patientId: string, versionId: string) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId) || !isPlausibleId(versionId)) return null;
  return prisma.anamnesis.findFirst({
    where: { id: versionId, patientId },
    select: ANAMNESIS_DETAIL_SELECT,
  });
}

export async function listAnamnesisVersions(patientId: string) {
  await requirePermission("clinico:ler");
  if (!isPlausibleId(patientId)) return [];
  return prisma.anamnesis.findMany({
    where: { patientId },
    orderBy: CURRENT_FIRST,
    select: ANAMNESIS_HISTORY_SELECT,
  });
}

export type AnamnesisDetail = NonNullable<Awaited<ReturnType<typeof getCurrentAnamnesis>>>;
export type AnamnesisVersionItem = Awaited<ReturnType<typeof listAnamnesisVersions>>[number];
