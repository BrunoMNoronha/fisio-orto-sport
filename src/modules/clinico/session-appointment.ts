import "server-only";
import type { AppointmentAttendance, AppointmentStatus, Prisma } from "@/generated/prisma/client";
import { ClinicoRuleError } from "./rules";
import { APPOINTMENT_SESSION_MESSAGES, appointmentSessionBlocker } from "./session-validation";

// Atendimento gerado a partir de agendamento (MEL-01, #44), dentro da transação de createSession.
// A linha do agendamento fica travada (FOR UPDATE) até o fim: cancelar, reagendar e marcar presença
// (agenda/service.ts) travam a mesma linha, então esperam ou são esperados e relidos. O índice único
// parcial "TreatmentSession_appointmentId_valid_key" barra um segundo atendimento válido mesmo fora
// deste caminho; a FK composta garante que o agendamento é do mesmo paciente.
type Tx = Prisma.TransactionClient;

export class AppointmentLinkError extends ClinicoRuleError {
  constructor(
    message: string,
    public field?: "professionalId",
  ) {
    super(message);
    this.name = "AppointmentLinkError";
  }
}

type LockedRow = {
  patientId: string;
  professionalId: string;
  status: AppointmentStatus;
  startsAt: Date;
  attendance: AppointmentAttendance | null;
};

// Trava e valida. `existingId`: um reenvio do mesmo formulário (mesma chave) que já gerou o
// atendimento; a action devolve esse registro em vez de acusar duplicidade.
export async function lockAppointmentForSession(
  tx: Tx,
  input: { appointmentId: string; patientId: string; professionalId: string; requestId: string; now?: Date },
): Promise<{ existingId: string | null }> {
  const [row] = await tx.$queryRaw<LockedRow[]>`
    SELECT "patientId", "professionalId", "status", "startsAt", "attendance"
    FROM "Appointment" WHERE "id" = ${input.appointmentId} FOR UPDATE`;

  const existing = await tx.treatmentSession.findFirst({
    where: { idempotencyKey: input.requestId, patientId: input.patientId },
    select: { id: true },
  });
  if (existing) return { existingId: existing.id };

  const valid = row
    ? await tx.treatmentSession.findFirst({
        where: { appointmentId: input.appointmentId, status: "VALIDO" },
        select: { id: true },
      })
    : null;
  const blocker = appointmentSessionBlocker(
    row ? { ...row, hasValidSession: valid !== null } : null,
    input.patientId,
    input.now,
  );
  if (blocker) throw new AppointmentLinkError(blocker);
  if (row!.professionalId !== input.professionalId) {
    throw new AppointmentLinkError(APPOINTMENT_SESSION_MESSAGES.professional, "professionalId");
  }
  return { existingId: null };
}

// Gerar o atendimento registra o comparecimento, se a presença ainda não foi marcada (a falta já
// foi recusada acima). Uma marcação COMPARECEU anterior é mantida com o autor original.
export async function markAttendedBySession(tx: Tx, appointmentId: string, actorId: string, now: Date = new Date()) {
  await tx.appointment.updateMany({
    where: { id: appointmentId, status: "AGENDADO", attendance: null },
    data: { attendance: "COMPARECEU", attendanceMarkedAt: now, attendanceMarkedById: actorId },
  });
}

// P2002 do índice parcial: outra transação gerou o atendimento válido deste agendamento antes.
export function isAppointmentLinkConflict(error: unknown) {
  if (typeof error !== "object" || error === null || (error as { code?: unknown }).code !== "P2002") return false;
  const meta = JSON.stringify((error as { meta?: unknown }).meta ?? {});
  return meta.includes("appointmentId") || meta.includes("TreatmentSession_appointmentId_valid_key");
}
