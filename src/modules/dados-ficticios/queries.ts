import "server-only";
// Resumo exibido antes da confirmação (issue #73): quantidades previstas, usuários que serão usados e
// estado atual do conjunto. Só leitura; só é chamado quando o ambiente está habilitado.
import { prisma } from "@/lib/db";
import { DATASET_ID, expectedCounts, type EntityCounts } from "./catalog";
import { assignProfessionals, datasetStatus, eligibleProfessionals, type DatasetStatus } from "./generate";

export type DevDataPreview = {
  dataset: string;
  expected: EntityCounts;
  professionals: { name: string; crefito: string; patients: number }[];
  status: DatasetStatus;
};

export async function getDevDataPreview(): Promise<DevDataPreview> {
  const professionals = await eligibleProfessionals(prisma);
  const assignment = assignProfessionals(professionals);
  return {
    dataset: DATASET_ID,
    expected: expectedCounts(),
    professionals: professionals.map((p) => ({
      name: p.name,
      crefito: p.crefito,
      patients: [...assignment.values()].filter((item) => item?.id === p.id).length,
    })),
    status: await datasetStatus(prisma),
  };
}
