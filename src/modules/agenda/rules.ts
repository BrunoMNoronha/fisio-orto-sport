import "server-only";
import type { Prisma } from "@/generated/prisma/client";

// Regras de negócio da agenda, executadas dentro da transação da action.
type Tx = Prisma.TransactionClient;
type Slot = { professionalId: string; startsAt: Date; endsAt: Date };

export class AgendaRuleError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "AgendaRuleError";
  }
}

export const CONFLICT_MESSAGE = "O profissional já tem um agendamento nesse horário.";

export async function assertPatientActive(tx: Tx, patientId: string) {
  const patient = await tx.patient.findUnique({ where: { id: patientId }, select: { status: true } });
  if (!patient) throw new AgendaRuleError("Paciente não encontrado.", "patientId");
  if (patient.status !== "ATIVO") throw new AgendaRuleError("Paciente inativo não pode ser agendado.", "patientId");
}

// Profissional apto = usuário ativo com perfil FISIOTERAPEUTA.
export async function assertProfessionalAvailable(tx: Tx, professionalId: string) {
  const user = await tx.user.findUnique({ where: { id: professionalId }, select: { role: true, active: true } });
  if (!user || user.role !== "FISIOTERAPEUTA") {
    throw new AgendaRuleError("Profissional não encontrado.", "professionalId");
  }
  if (!user.active) throw new AgendaRuleError("Profissional inativo não pode receber agendamentos.", "professionalId");
}

// Sobreposição de intervalos [início, fim) com agendamentos ativos do mesmo profissional.
export async function assertNoConflict(tx: Tx, slot: Slot, excludeId?: string) {
  const conflict = await tx.appointment.findFirst({
    where: {
      professionalId: slot.professionalId,
      status: "AGENDADO",
      startsAt: { lt: slot.endsAt },
      endsAt: { gt: slot.startsAt },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (conflict) throw new AgendaRuleError(CONFLICT_MESSAGE, "startTime");
}

// A constraint "Appointment_no_overlap" (SQLSTATE 23P01) barra a corrida entre duas requisições simultâneas.
export function isOverlapViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    const text = `${String(record.message ?? "")} ${String(record.code ?? "")} ${JSON.stringify(record.meta ?? {})}`;
    if (text.includes("Appointment_no_overlap") || text.includes("23P01")) return true;
    current = record.cause;
  }
  return false;
}
