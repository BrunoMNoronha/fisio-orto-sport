import "server-only";
import type { Prisma } from "@/generated/prisma/client";

// Regras da anamnese, executadas dentro da transação da action.
type Tx = Prisma.TransactionClient;

export class ClinicoRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClinicoRuleError";
  }
}

export const PATIENT_NOT_FOUND = "Paciente não encontrado.";
export const PATIENT_INACTIVE = "Paciente inativo não pode receber nova anamnese. Reative o cadastro antes de registrar.";

// Paciente INATIVO continua consultável, mas não recebe nova versão até ser reativado.
export async function assertPatientCanReceiveAnamnesis(tx: Tx, patientId: string) {
  const patient = await tx.patient.findUnique({ where: { id: patientId }, select: { status: true } });
  if (!patient) throw new ClinicoRuleError(PATIENT_NOT_FOUND);
  if (patient.status !== "ATIVO") throw new ClinicoRuleError(PATIENT_INACTIVE);
}
