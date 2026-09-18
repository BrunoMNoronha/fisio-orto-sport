/** @jest-environment node */
const currentRole = { current: null as string | null };

jest.mock("@/modules/auth/dal", () => {
  const { can } = jest.requireActual("@/modules/auth/permissions");
  class AccessDenied extends Error {}
  return {
    AccessDenied,
    requirePermission: jest.fn(async (permission: string) => {
      if (!currentRole.current || !can(currentRole.current, permission)) throw new AccessDenied("redirect");
      return { id: "u1", name: "U", email: "u@example.com", role: currentRole.current };
    }),
  };
});

const prismaMock = {
  appointment: { findMany: jest.fn(), findUnique: jest.fn() },
  user: { findMany: jest.fn() },
  patient: { findMany: jest.fn() },
};
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

import { requirePermission } from "@/modules/auth/dal";
import {
  APPOINTMENT_DETAIL_SELECT,
  APPOINTMENT_LIST_SELECT,
  getAppointment,
  listActivePatientOptions,
  listAgenda,
  listProfessionals,
} from "../queries";

beforeEach(() => {
  jest.clearAllMocks();
  currentRole.current = "FISIOTERAPEUTA";
  prismaMock.appointment.findMany.mockResolvedValue([]);
});

describe("listAgenda", () => {
  it("filtra por período (horário da clínica) e profissional, incluindo cancelados", async () => {
    await listAgenda({ professionalId: "f1", from: "2026-09-21", to: "2026-09-27" });
    expect(requirePermission).toHaveBeenCalledWith("agenda:ler");
    expect(prismaMock.appointment.findMany).toHaveBeenCalledWith({
      where: {
        startsAt: { gte: new Date("2026-09-21T03:00:00.000Z"), lt: new Date("2026-09-28T03:00:00.000Z") },
        professionalId: "f1",
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: APPOINTMENT_LIST_SELECT,
    });
    // Sem filtro por status: cancelados continuam consultáveis.
    expect(prismaMock.appointment.findMany.mock.calls[0][0].where).not.toHaveProperty("status");
  });

  it("sem profissional, lista todos", async () => {
    await listAgenda({ from: "2026-09-21", to: "2026-09-21" });
    expect(prismaMock.appointment.findMany.mock.calls[0][0].where).not.toHaveProperty("professionalId");
  });

  it("período sem agendamentos devolve lista vazia", async () => {
    await expect(listAgenda({ from: "2026-09-21", to: "2026-09-21" })).resolves.toEqual([]);
  });

  it("bloqueia quem não tem agenda:ler", async () => {
    currentRole.current = null;
    await expect(listAgenda({ from: "2026-09-21", to: "2026-09-21" })).rejects.toThrow("redirect");
    expect(prismaMock.appointment.findMany).not.toHaveBeenCalled();
  });
});

describe("seleções", () => {
  it("não carregam dados clínicos nem cadastrais sensíveis do paciente", () => {
    expect(APPOINTMENT_LIST_SELECT.patient).toEqual({ select: { id: true, fullName: true } });
    expect(APPOINTMENT_DETAIL_SELECT.patient).toEqual({ select: { id: true, fullName: true } });
  });
});

describe("getAppointment", () => {
  it("consulta por id com agenda:ler", async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({ id: "a1", status: "CANCELADO" });
    await expect(getAppointment("a1")).resolves.toEqual({ id: "a1", status: "CANCELADO" });
    expect(prismaMock.appointment.findUnique).toHaveBeenCalledWith({
      where: { id: "a1" },
      select: APPOINTMENT_DETAIL_SELECT,
    });
  });

  it("id inválido não consulta o banco", async () => {
    await expect(getAppointment("x".repeat(65))).resolves.toBeNull();
    expect(prismaMock.appointment.findUnique).not.toHaveBeenCalled();
  });
});

describe("opções", () => {
  it("profissionais são fisioterapeutas ativos", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    await listProfessionals();
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: "FISIOTERAPEUTA", active: true } }),
    );
  });

  it("pacientes para agendar: só ativos e só com agenda:gerir", async () => {
    await expect(listActivePatientOptions()).rejects.toThrow("redirect");
    currentRole.current = "RECEPCAO";
    prismaMock.patient.findMany.mockResolvedValue([]);
    await listActivePatientOptions();
    expect(prismaMock.patient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "ATIVO" } }));
  });
});
