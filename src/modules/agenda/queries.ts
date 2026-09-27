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
  // Presença (MEL-01) e se há atendimento válido vinculado: só o id do atendimento, nunca o conteúdo
  // clínico (a Recepção vê apenas que o atendimento foi registrado).
  attendance: true,
  attendanceMarkedAt: true,
  attendanceMarkedBy: PERSON,
  sessions: { where: { status: "VALIDO" }, select: { id: true }, take: 1 },
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

// Pré-seleção do formulário (ex.: /agenda/novo?patientId=…): só se o paciente estiver ativo.
// A escolha em si é feita pela busca `searchActivePatients` (actions.ts), sem lista fixa.
export async function getActivePatientOption(id: string | undefined) {
  await requirePermission("agenda:gerir");
  if (!id || id.length > 64) return null;
  const patient = await prisma.patient.findFirst({
    where: { id, status: "ATIVO" },
    select: { id: true, fullName: true },
  });
  return patient ? { id: patient.id, label: patient.fullName } : null;
}

// Bloqueios ativos (MEL-02) que tocam o período, para as visões dia e semana. Remoção lógica: os
// removidos não aparecem nem ocupam horário.
export const BLOCK_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  reason: true,
  professional: PERSON,
} as const;

export async function listScheduleBlocks(filter: AgendaFilter) {
  await requirePermission("agenda:ler");
  const { gte, lt } = filterBounds(filter);
  return prisma.scheduleBlock.findMany({
    where: {
      removedAt: null,
      startsAt: { lt },
      endsAt: { gt: gte },
      ...(filter.professionalId ? { professionalId: filter.professionalId } : {}),
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: BLOCK_SELECT,
  });
}

// Tela de bloqueios: ativos que ainda não terminaram, com autoria.
export const UPCOMING_BLOCKS_LIMIT = 200;

export async function listUpcomingBlocks(
  { professionalId, now = new Date() }: { professionalId?: string; now?: Date } = {},
) {
  await requirePermission("agenda:ler");
  return prisma.scheduleBlock.findMany({
    where: {
      removedAt: null,
      endsAt: { gt: now },
      ...(professionalId && professionalId.length <= 64 ? { professionalId } : {}),
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: UPCOMING_BLOCKS_LIMIT,
    select: { ...BLOCK_SELECT, createdAt: true, createdBy: PERSON },
  });
}

export type AgendaItem = Awaited<ReturnType<typeof listAgenda>>[number];
export type AppointmentDetail = NonNullable<Awaited<ReturnType<typeof getAppointment>>>;
export type ScheduleBlockItem = Awaited<ReturnType<typeof listScheduleBlocks>>[number];
export type UpcomingBlock = Awaited<ReturnType<typeof listUpcomingBlocks>>[number];
