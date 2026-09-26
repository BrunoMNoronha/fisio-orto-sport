import "server-only";
import type { PatientStatus, Prisma } from "@/generated/prisma/client";

// Regras clínicas (anamnese e avaliação), executadas dentro da transação da action.
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
  await assertPatientActive(tx, patientId, PATIENT_INACTIVE);
}

export const PATIENT_INACTIVE_ASSESSMENT =
  "Paciente inativo não pode receber nova avaliação nem edição. Reative o cadastro antes de registrar.";

// Mesma regra (e mesmo lock) para criar e editar avaliações.
export async function assertPatientCanReceiveAssessment(tx: Tx, patientId: string) {
  await assertPatientActive(tx, patientId, PATIENT_INACTIVE_ASSESSMENT);
}

export const PATIENT_INACTIVE_PLAN =
  "Paciente inativo não pode receber novo plano, revisão nem mudança de estado do plano. Reative o cadastro antes.";

// Criar, revisar, encerrar e reabrir plano: mesma regra (e mesmo lock) da anamnese e da avaliação.
export async function assertPatientCanReceivePlan(tx: Tx, patientId: string) {
  await assertPatientActive(tx, patientId, PATIENT_INACTIVE_PLAN);
}

async function assertPatientActive(tx: Tx, patientId: string, inactiveMessage: string) {
  const [patient] = await tx.$queryRaw<{ status: PatientStatus }[]>`
    SELECT "status" FROM "Patient" WHERE "id" = ${patientId} FOR UPDATE`;
  if (!patient) throw new ClinicoRuleError(PATIENT_NOT_FOUND);
  if (patient.status !== "ATIVO") throw new ClinicoRuleError(inactiveMessage);
}

// Assinatura histórica (D1/D3): nome e CREFITO lidos do usuário autenticado na própria transação,
// nunca do formulário. CREFITO é nulo para quem não o tem (ex.: Administrador).
export async function signature(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true, crefito: true } });
  if (!user) throw new ClinicoRuleError("Acesso negado.");
  return { name: user.name, crefito: user.crefito };
}
