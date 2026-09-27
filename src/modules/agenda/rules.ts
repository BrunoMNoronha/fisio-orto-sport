import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { toLocalDate, toLocalTime } from "./validation";

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

export const BLOCKED_MESSAGE = "O profissional está com a agenda bloqueada nesse horário.";

// MEL-02 (#45): não se agenda sobre bloqueio ativo do profissional. Roda sob o lock por profissional
// (service.ts), o mesmo tomado ao criar bloqueio, então as duas checagens não se cruzam.
export async function assertNotBlocked(tx: Tx, slot: Slot) {
  const block = await tx.scheduleBlock.findFirst({
    where: {
      professionalId: slot.professionalId,
      removedAt: null,
      startsAt: { lt: slot.endsAt },
      endsAt: { gt: slot.startsAt },
    },
    select: { id: true },
  });
  if (block) throw new AgendaRuleError(BLOCKED_MESSAGE, "startTime");
}

// Item de conflito exibido ao usuário: só dados administrativos (horário, profissional ou paciente).
export type ConflictItem = { id: string; label: string };
const CONFLICT_LIST_LIMIT = 20;

function when(startsAt: Date, endsAt: Date) {
  const [y, m, d] = toLocalDate(startsAt).split("-");
  return `${d}/${m}/${y} ${toLocalTime(startsAt)}–${toLocalTime(endsAt)}`;
}

// Conflito do paciente (MEL-02): só aviso. A pessoa confirma e o agendamento segue (encaixe
// legítimo). Não há lock por paciente: é aviso, não garantia.
export class PatientConflictWarning extends Error {
  constructor(public conflicts: ConflictItem[]) {
    super("O paciente já tem agendamento nesse horário.");
    this.name = "PatientConflictWarning";
  }
}

export async function checkPatientConflict(
  tx: Tx,
  slot: { patientId: string; startsAt: Date; endsAt: Date },
  excludeId?: string,
) {
  const rows = await tx.appointment.findMany({
    where: {
      patientId: slot.patientId,
      status: "AGENDADO",
      startsAt: { lt: slot.endsAt },
      endsAt: { gt: slot.startsAt },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: CONFLICT_LIST_LIMIT,
    select: { id: true, startsAt: true, endsAt: true, professional: { select: { name: true } } },
  });
  if (rows.length > 0) {
    throw new PatientConflictWarning(
      rows.map((row) => ({ id: row.id, label: `${when(row.startsAt, row.endsAt)} com ${row.professional.name}` })),
    );
  }
}

// Bloqueio sobre agendamento AGENDADO é recusado (decisão de 27/09/2026): nada é cancelado em
// silêncio; a pessoa reagenda ou cancela os listados e tenta de novo.
export class BlockOverlapError extends Error {
  constructor(public conflicts: ConflictItem[]) {
    super(
      "O profissional tem agendamentos nesse período. Reagende ou cancele os agendamentos abaixo antes de bloquear.",
    );
    this.name = "BlockOverlapError";
  }
}

export async function assertNoAppointmentsInBlock(tx: Tx, slot: Slot) {
  const rows = await tx.appointment.findMany({
    where: {
      professionalId: slot.professionalId,
      status: "AGENDADO",
      startsAt: { lt: slot.endsAt },
      endsAt: { gt: slot.startsAt },
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: CONFLICT_LIST_LIMIT,
    select: { id: true, startsAt: true, endsAt: true, patient: { select: { fullName: true } } },
  });
  if (rows.length > 0) {
    throw new BlockOverlapError(
      rows.map((row) => ({ id: row.id, label: `${when(row.startsAt, row.endsAt)} · ${row.patient.fullName}` })),
    );
  }
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
