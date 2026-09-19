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
  appointment: { findFirst: jest.fn() },
  anamnesis: { findFirst: jest.fn() },
};
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

import { TERMO_SECTIONS, getAnamnesisAuthor, getAttendingPhysio } from "../documents";

const NOW = new Date("2026-09-18T15:00:00Z");
const FROM_APPOINTMENT = { name: "Ana Fisio", crefito: "123456-F" };
const FROM_ANAMNESIS = { name: "Beto Fisio", crefito: null };

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.appointment.findFirst.mockResolvedValue(null);
  prismaMock.anamnesis.findFirst.mockResolvedValue(null);
});

describe("getAttendingPhysio", () => {
  it("usa o agendamento não cancelado mais recente já iniciado", async () => {
    currentRole.current = "FISIOTERAPEUTA";
    prismaMock.appointment.findFirst.mockResolvedValue({ professional: FROM_APPOINTMENT });

    await expect(getAttendingPhysio("p1", NOW)).resolves.toEqual(FROM_APPOINTMENT);
    expect(prismaMock.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientId: "p1", status: "AGENDADO", startsAt: { lt: NOW } },
        orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      }),
    );
    expect(prismaMock.anamnesis.findFirst).not.toHaveBeenCalled();
  });

  it("sem atendimento, cai no autor da anamnese vigente", async () => {
    currentRole.current = "FISIOTERAPEUTA";
    prismaMock.anamnesis.findFirst.mockResolvedValue({ author: FROM_ANAMNESIS });

    await expect(getAttendingPhysio("p1", NOW)).resolves.toEqual(FROM_ANAMNESIS);
    expect(prismaMock.anamnesis.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: "p1" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    );
  });

  it("sem clinico:ler, não consulta a anamnese", async () => {
    currentRole.current = "RECEPCAO";
    await expect(getAttendingPhysio("p1", NOW)).resolves.toBeNull();
    expect(prismaMock.anamnesis.findFirst).not.toHaveBeenCalled();
  });

  it("sem atendimento nem anamnese, devolve null", async () => {
    currentRole.current = "ADMIN";
    await expect(getAttendingPhysio("p1", NOW)).resolves.toBeNull();
  });

  it("sem sessão não chega ao banco", async () => {
    currentRole.current = null;
    await expect(getAttendingPhysio("p1", NOW)).rejects.toThrow();
    expect(prismaMock.appointment.findFirst).not.toHaveBeenCalled();
  });

  it("id implausível não consulta", async () => {
    currentRole.current = "ADMIN";
    await expect(getAttendingPhysio("x".repeat(65), NOW)).resolves.toBeNull();
    expect(prismaMock.appointment.findFirst).not.toHaveBeenCalled();
  });
});

describe("getAnamnesisAuthor", () => {
  it("exige clinico:ler", async () => {
    currentRole.current = "RECEPCAO";
    await expect(getAnamnesisAuthor("p1")).rejects.toThrow();
    expect(prismaMock.anamnesis.findFirst).not.toHaveBeenCalled();
  });
});

describe("TERMO_SECTIONS", () => {
  it("tem as 9 seções e o parágrafo do pacote de 10 sessões", () => {
    expect(TERMO_SECTIONS).toHaveLength(9);
    expect(TERMO_SECTIONS[3].paragraphs.join(" ")).toContain("pacote de 10 (dez) sessões");
  });
});
