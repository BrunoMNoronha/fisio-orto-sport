/** @jest-environment node */
// Chamada direta das Server Actions da agenda: autorização, regras e conflito são
// verificados no servidor, sem depender da UI.
const currentUser = { current: null as null | { id: string; name: string; email: string; role: string } };

jest.mock("@/modules/auth/dal", () => {
  const { can } = jest.requireActual("@/modules/auth/permissions");
  class AuthorizationError extends Error {}
  return {
    AuthorizationError,
    assertPermission: jest.fn(async (permission: string) => {
      if (!currentUser.current || !can(currentUser.current.role, permission)) throw new AuthorizationError();
      return currentUser.current;
    }),
  };
});

jest.mock("server-only", () => ({}));

const prismaMock = {
  $transaction: jest.fn(),
  patient: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  appointment: {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

class RedirectSignal extends Error {
  constructor(public url: string) {
    super("NEXT_REDIRECT");
  }
}
jest.mock("next/navigation", () => ({
  redirect: jest.fn((url: string) => {
    throw new RedirectSignal(url);
  }),
}));

import { cancelAppointment, createAppointment, rescheduleAppointment } from "../actions";
import { CONFLICT_MESSAGE } from "../rules";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function as(role: string | null) {
  currentUser.current = role ? { id: `u-${role}`, name: role, email: `${role}@example.com`, role } : null;
}

const slot = { professionalId: "f1", date: "2026-09-21", startTime: "09:00", endTime: "10:00" };
const newAppointment = { patientId: "p1", ...slot };
const STARTS = new Date("2026-09-21T12:00:00.000Z");
const ENDS = new Date("2026-09-21T13:00:00.000Z");

// Erro que o Prisma lança quando a constraint de exclusão do banco barra uma corrida.
const overlapError = Object.assign(new Error("Database error. Code: `23P01`."), {
  code: "P2039",
  meta: { driverAdapterError: { cause: { code: "23P01", message: 'violates exclusion constraint "Appointment_no_overlap"' } } },
});

async function expectRedirect(promise: Promise<unknown>, url: string) {
  await expect(promise).rejects.toMatchObject({ url });
}

beforeEach(() => {
  jest.clearAllMocks();
  as("RECEPCAO");
  prismaMock.$transaction.mockImplementation((fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
  prismaMock.patient.findUnique.mockResolvedValue({ status: "ATIVO" });
  prismaMock.user.findUnique.mockResolvedValue({ role: "FISIOTERAPEUTA", active: true });
  prismaMock.appointment.findFirst.mockResolvedValue(null);
  prismaMock.appointment.create.mockResolvedValue({ id: "a1" });
  prismaMock.appointment.findUnique.mockResolvedValue({ status: "AGENDADO" });
  prismaMock.appointment.update.mockResolvedValue({ id: "a1" });
  prismaMock.appointment.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  // Nenhuma action da agenda exclui fisicamente.
  expect(prismaMock.appointment.delete).not.toHaveBeenCalled();
  expect(prismaMock.appointment.deleteMany).not.toHaveBeenCalled();
});

describe("autorização (agenda:gerir)", () => {
  it.each([null, "FISIOTERAPEUTA"])("perfil %s é bloqueado em todas as actions", async (role) => {
    as(role);
    await expect(createAppointment(undefined, form(newAppointment))).resolves.toEqual({ error: "Acesso negado." });
    await expect(rescheduleAppointment(undefined, form({ id: "a1", ...slot }))).resolves.toEqual({
      error: "Acesso negado.",
    });
    await expect(cancelAppointment(undefined, form({ id: "a1" }))).resolves.toEqual({ error: "Acesso negado." });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.appointment.updateMany).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "RECEPCAO"])("perfil %s pode criar", async (role) => {
    as(role);
    await expectRedirect(createAppointment(undefined, form(newAppointment)), "/agenda/a1");
  });
});

describe("createAppointment", () => {
  it("cria agendamento válido com autoria", async () => {
    await expectRedirect(createAppointment(undefined, form({ ...newAppointment, notes: "Primeira vez" })), "/agenda/a1");
    expect(prismaMock.appointment.create).toHaveBeenCalledWith({
      data: {
        patientId: "p1",
        professionalId: "f1",
        startsAt: STARTS,
        endsAt: ENDS,
        notes: "Primeira vez",
        createdById: "u-RECEPCAO",
        updatedById: "u-RECEPCAO",
      },
      select: { id: true },
    });
  });

  it("devolve erros de validação sem tocar no banco", async () => {
    const result = await createAppointment(undefined, form({ ...newAppointment, endTime: "08:00" }));
    expect(result?.fieldErrors?.endTime).toBeDefined();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejeita paciente inexistente", async () => {
    prismaMock.patient.findUnique.mockResolvedValue(null);
    const result = await createAppointment(undefined, form(newAppointment));
    expect(result).toEqual({ fieldErrors: { patientId: ["Paciente não encontrado."] } });
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it("rejeita paciente inativo", async () => {
    prismaMock.patient.findUnique.mockResolvedValue({ status: "INATIVO" });
    const result = await createAppointment(undefined, form(newAppointment));
    expect(result).toEqual({ fieldErrors: { patientId: ["Paciente inativo não pode ser agendado."] } });
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it.each([
    [null, "Profissional não encontrado."],
    [{ role: "RECEPCAO", active: true }, "Profissional não encontrado."],
    [{ role: "FISIOTERAPEUTA", active: false }, "Profissional inativo não pode receber agendamentos."],
  ])("rejeita profissional inapto (%o)", async (user, message) => {
    prismaMock.user.findUnique.mockResolvedValue(user);
    const result = await createAppointment(undefined, form(newAppointment));
    expect(result).toEqual({ fieldErrors: { professionalId: [message] } });
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it("rejeita conflito com agendamento ativo do mesmo profissional", async () => {
    prismaMock.appointment.findFirst.mockResolvedValue({ id: "outro" });
    const result = await createAppointment(undefined, form(newAppointment));
    expect(result).toEqual({ fieldErrors: { startTime: [CONFLICT_MESSAGE] } });
    expect(prismaMock.appointment.findFirst).toHaveBeenCalledWith({
      where: { professionalId: "f1", status: "AGENDADO", startsAt: { lt: ENDS }, endsAt: { gt: STARTS } },
      select: { id: true },
    });
    expect(prismaMock.appointment.create).not.toHaveBeenCalled();
  });

  it("converte a violação da constraint do banco (corrida) em conflito", async () => {
    prismaMock.appointment.create.mockRejectedValue(overlapError);
    const result = await createAppointment(undefined, form(newAppointment));
    expect(result).toEqual({ fieldErrors: { startTime: [CONFLICT_MESSAGE] } });
  });

  it("propaga erros inesperados", async () => {
    prismaMock.appointment.create.mockRejectedValue(new Error("falha de rede"));
    await expect(createAppointment(undefined, form(newAppointment))).rejects.toThrow("falha de rede");
  });
});

describe("rescheduleAppointment", () => {
  it("reagenda e ignora o próprio agendamento na checagem de conflito", async () => {
    await expectRedirect(
      rescheduleAppointment(undefined, form({ id: "a1", ...slot, startTime: "14:00", endTime: "15:00" })),
      "/agenda/a1",
    );
    expect(prismaMock.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: "a1" }, status: "AGENDADO" }) }),
    );
    expect(prismaMock.appointment.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: {
        professionalId: "f1",
        startsAt: new Date("2026-09-21T17:00:00.000Z"),
        endsAt: new Date("2026-09-21T18:00:00.000Z"),
        updatedById: "u-RECEPCAO",
      },
      select: { id: true },
    });
  });

  it("repete a validação de conflito", async () => {
    prismaMock.appointment.findFirst.mockResolvedValue({ id: "outro" });
    const result = await rescheduleAppointment(undefined, form({ id: "a1", ...slot }));
    expect(result).toEqual({ fieldErrors: { startTime: [CONFLICT_MESSAGE] } });
    expect(prismaMock.appointment.update).not.toHaveBeenCalled();
  });

  it("repete a validação do profissional", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: "FISIOTERAPEUTA", active: false });
    const result = await rescheduleAppointment(undefined, form({ id: "a1", ...slot }));
    expect(result?.fieldErrors?.professionalId).toBeDefined();
    expect(prismaMock.appointment.update).not.toHaveBeenCalled();
  });

  it("não reagenda agendamento cancelado", async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({ status: "CANCELADO" });
    const result = await rescheduleAppointment(undefined, form({ id: "a1", ...slot }));
    expect(result).toEqual({ error: "Agendamento cancelado não pode ser alterado." });
    expect(prismaMock.appointment.update).not.toHaveBeenCalled();
  });

  it("agendamento inexistente", async () => {
    prismaMock.appointment.findUnique.mockResolvedValue(null);
    const result = await rescheduleAppointment(undefined, form({ id: "x", ...slot }));
    expect(result).toEqual({ error: "Agendamento não encontrado." });
  });

  it("converte a violação da constraint do banco em conflito", async () => {
    prismaMock.appointment.update.mockRejectedValue(overlapError);
    const result = await rescheduleAppointment(undefined, form({ id: "a1", ...slot }));
    expect(result).toEqual({ fieldErrors: { startTime: [CONFLICT_MESSAGE] } });
  });
});

describe("cancelAppointment", () => {
  it("cancela preservando o registro e liberando o horário", async () => {
    const result = await cancelAppointment(undefined, form({ id: "a1", reason: "Paciente viajou" }));
    expect(result).toEqual({ ok: true, message: "Agendamento cancelado." });
    expect(prismaMock.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: "a1", status: "AGENDADO" },
      data: {
        status: "CANCELADO",
        cancelledAt: expect.any(Date),
        cancelReason: "Paciente viajou",
        cancelledById: "u-RECEPCAO",
        updatedById: "u-RECEPCAO",
      },
    });
  });

  it("motivo é opcional", async () => {
    await cancelAppointment(undefined, form({ id: "a1" }));
    expect(prismaMock.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cancelReason: null }) }),
    );
  });

  it("agendamento já cancelado", async () => {
    prismaMock.appointment.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.appointment.findUnique.mockResolvedValue({ id: "a1" });
    await expect(cancelAppointment(undefined, form({ id: "a1" }))).resolves.toEqual({
      error: "Agendamento já está cancelado.",
    });
  });

  it("agendamento inexistente", async () => {
    prismaMock.appointment.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.appointment.findUnique.mockResolvedValue(null);
    await expect(cancelAppointment(undefined, form({ id: "x" }))).resolves.toEqual({
      error: "Agendamento não encontrado.",
    });
  });
});
