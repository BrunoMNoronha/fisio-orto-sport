import "server-only";
import type { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { assertPatientCanReceiveAnamnesis, signature } from "./rules";
import type { anamnesisSchema } from "./validation";

// Gravação de nova versão da anamnese, sem autorização nem navegação (feitas pela action). Recebe o
// cliente Prisma para que a integração exercite exatamente esta transação. Append-only: só cria.
type Db = Pick<PrismaClient, "$transaction">;
export type AnamnesisData = z.output<typeof anamnesisSchema>;

export async function insertAnamnesisVersion(db: Db, patientId: string, data: AnamnesisData, actorId: string) {
  return db.$transaction(async (tx) => {
    await assertPatientCanReceiveAnamnesis(tx, patientId);
    // Assinatura histórica (MEL-03, #46): nome e CREFITO lidos do usuário autenticado na própria
    // transação, nunca do formulário. CREFITO nulo para quem não o tem (ex.: Administrador).
    const author = await signature(tx, actorId);
    const created = await tx.anamnesis.create({
      data: {
        ...data,
        patientId,
        authorId: actorId,
        authorNameSnapshot: author.name,
        authorCrefitoSnapshot: author.crefito,
        authorCrefitoRecorded: true,
      },
      select: { id: true },
    });
    return created.id;
  });
}
