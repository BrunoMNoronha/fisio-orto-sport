import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { filterBounds, type AgendaFilter } from "./validation";

// Seleções explícitas: a agenda mostra só dados administrativos, nunca clínicos.
const PERSON = { select: { id: true, name: true } } as const;

export const APPOINTMENT_LIST_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  patient: { select: { id: true, fullName: true } },
  professional: PERSON,
} as const;

export const APPOINTMENT_DETAIL_SELECT = {
  ...APPOINTMENT_LIST_SELECT,
  notes: true,
  cancelledAt: true,
  cancelReason: true,
  cancelledBy: PERSON,
  createdAt: true,
  updatedAt: true,
  createdBy: PERSON,
} as const;

// Inclui cancelados (continuam consultáveis); a UI os marca. Período em horário da clínica.
export async function listAgenda(filter: AgendaFilter) {
  await requirePermission("agenda:ler");
  const { gte, lt } = filterBounds(filter);
  return prisma.appointment.findMany({
    where: {
      startsAt: { gte, lt },
      ...(filter.professionalId ? { professionalId: filter.professionalId } : {}),
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: APPOINTMENT_LIST_SELECT,
  });
}

export async function getAppointment(id: string) {
  await requirePermission("agenda:ler");
  if (!id || id.length > 64) return null;
  return prisma.appointment.findUnique({ where: { id }, select: APPOINTMENT_DETAIL_SELECT });
}

// Agendamentos de um paciente (inclui cancelados), para a ficha. Só dados administrativos.
// `upcoming`: a partir de `now`, em ordem crescente; caso contrário, anteriores em ordem decrescente.
export async function listPatientAppointments(
  patientId: string,
  { upcoming, take, now = new Date() }: { upcoming: boolean; take?: number; now?: Date },
) {
  await requirePermission("agenda:ler");
  if (!patientId || patientId.length > 64) return [];
  const direction = upcoming ? ("asc" as const) : ("desc" as const);
  return prisma.appointment.findMany({
    where: { patientId, startsAt: upcoming ? { gte: now } : { lt: now } },
    orderBy: [{ startsAt: direction }, { id: direction }],
    ...(take ? { take } : {}),
    select: APPOINTMENT_LIST_SELECT,
  });
}

// Profissionais aptos a atender: fisioterapeutas ativos.
export async function listProfessionals() {
  await requirePermission("agenda:ler");
  return prisma.user.findMany({
    where: { role: "FISIOTERAPEUTA", active: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
}

// Opções para o formulário: somente pacientes ativos.
export async function listActivePatientOptions() {
  await requirePermission("agenda:gerir");
  return prisma.patient.findMany({
    where: { status: "ATIVO" },
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
    take: 500,
    select: { id: true, fullName: true },
  });
}

export type AgendaItem = Awaited<ReturnType<typeof listAgenda>>[number];
export type AppointmentDetail = NonNullable<Awaited<ReturnType<typeof getAppointment>>>;
