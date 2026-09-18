import "server-only";
import type { PatientStatus, Prisma } from "@/generated/prisma/client";

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
// FOR UPDATE bloqueia a linha do paciente até o fim da transação: uma inativação concorrente
// (UPDATE em setPatientStatus) espera, ou é esperada e relida em READ COMMITTED. Sem o lock,
// a FK do INSERT só pega FOR KEY SHARE, que não conflita com a mudança de status.
export async function assertPatientCanReceiveAnamnesis(tx: Tx, patientId: string) {
  const [patient] = await tx.$queryRaw<{ status: PatientStatus }[]>`
    SELECT "status" FROM "Patient" WHERE "id" = ${patientId} FOR UPDATE`;
  if (!patient) throw new ClinicoRuleError(PATIENT_NOT_FOUND);
  if (patient.status !== "ATIVO") throw new ClinicoRuleError(PATIENT_INACTIVE);
}
