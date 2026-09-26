/** @jest-environment node */
// Chamada direta das Server Actions de atendimento: autorização, vínculos, responsável, idempotência,
// correção com histórico, invalidação e concorrência.
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

const tx = {
  $queryRaw: jest.fn(),
  user: { findUnique: jest.fn(), findFirst: jest.fn() },
  therapyPlanRevision: { findFirst: jest.fn() },
  treatmentSession: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
  treatmentSessionChange: { createMany: jest.fn() },
  appointment: { update: jest.fn(), updateMany: jest.fn() },
};
const prismaMock = {
  ...tx,
  $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
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

import { Prisma } from "@/generated/prisma/client";
import { createSession, invalidateSession, updateSession } from "../session-actions";

const SECRET = "SEGREDO-CLINICO-FICTICIO";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

const valid = {
  planId: "pl1",
  planRevisionId: "r2",
  requestId: "req-0001-abcdef",
  occurredDate: "2026-09-20",
  occurredTime: "14:30",
  professionalId: "uFISIOTERAPEUTA",
  evolution: `Melhora ${SECRET}`,
};

const storedSession = {
  status: "VALIDO",
  version: 1,
  planId: "pl1",
  occurredAt: new Date("2026-09-20T17:30:00.000Z"),
  professionalId: "uFISIOTERAPEUTA",
  professionalNameSnapshot: "Bruna",
  professionalCrefitoSnapshot: "123456-F",
  techniques: null,
  exercises: null,
  observations: null,
  evolution: "Melhora",
  nextSteps: null,
  planRevision: { planDate: new Date("2026-09-10T00:00:00.000Z") },
};

const editForm = (overrides: Record<string, string> = {}) =>
  form({
    version: "1",
    reason: "Hora digitada errada",
    occurredDate: "2026-09-20",
    occurredTime: "14:30",
    professionalId: "uFISIOTERAPEUTA",
    evolution: "Melhora",
    ...overrides,
  });

function as(role: string | null) {
  currentUser.current = role ? { id: `u${role}`, name: `Sessão ${role}`, email: `${role}@example.com`, role } : null;
}

let consoleSpies: jest.SpyInstance[];

beforeEach(() => {
  jest.clearAllMocks();
  // 1ª chamada: lock do paciente; 2ª: lock do plano (FOR SHARE).
  tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) =>
    sql.join("?").includes('"TherapyPlan"') ? [{ status: "ATIVO" }] : [{ status: "ATIVO" }],
  );
  tx.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    name: `Nome ${where.id}`,
    crefito: where.id === "uFISIOTERAPEUTA" ? "123456-F" : null,
  }));
  tx.user.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id.startsWith("uFISIO") || where.id === "f2" ? { id: where.id, name: `Fisio ${where.id}`, crefito: "999-F" } : null,
  );
  tx.therapyPlanRevision.findFirst.mockImplementation(async ({ where }: { where: { number?: number; id?: string } }) =>
    where.number === 1
      ? { planDate: new Date("2026-09-01T00:00:00.000Z") }
      : where.id === "r2"
        ? { planDate: new Date("2026-09-10T00:00:00.000Z") }
        : null,
  );
  tx.treatmentSession.create.mockResolvedValue({ id: "s1" });
  tx.treatmentSession.findFirst.mockResolvedValue(storedSession);
  tx.treatmentSession.updateMany.mockResolvedValue({ count: 1 });
  tx.treatmentSessionChange.createMany.mockResolvedValue({ count: 1 });
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
    jest.spyOn(console, level).mockImplementation(() => {}),
  );
});

afterEach(() => {
  for (const spy of consoleSpies) {
    expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET);
    spy.mockRestore();
  }
});

function expectNoWrites() {
  expect(tx.treatmentSession.create).not.toHaveBeenCalled();
  expect(tx.treatmentSession.updateMany).not.toHaveBeenCalled();
  expect(tx.treatmentSessionChange.createMany).not.toHaveBeenCalled();
}

describe("createSession", () => {
  it("Fisioterapeuta registra como responsável por si, com revisão exata, autoria e chave", async () => {
    as("FISIOTERAPEUTA");
    await expect(createSession("p1", undefined, form(valid))).rejects.toMatchObject({ url: "/pacientes/p1/sessoes/s1" });
    const { data } = tx.treatmentSession.create.mock.calls[0][0];
    expect(data).toMatchObject({
      patientId: "p1",
      planId: "pl1",
      planRevisionId: "r2",
      occurredAt: new Date("2026-09-20T17:30:00.000Z"),
      professionalId: "uFISIOTERAPEUTA",
      professionalNameSnapshot: "Fisio uFISIOTERAPEUTA",
      idempotencyKey: "req-0001-abcdef",
      authorId: "uFISIOTERAPEUTA",
      authorCrefitoSnapshot: "123456-F",
    });
    const sqls = tx.$queryRaw.mock.calls.map(([sql]) => sql.join("?"));
    expect(sqls[0]).toMatch(/"Patient".*FOR UPDATE/);
    expect(sqls[1]).toMatch(/"TherapyPlan".*"patientId".*FOR SHARE/);
    // Nenhuma mudança na agenda.
    expect(tx.appointment.update).not.toHaveBeenCalled();
    expect(tx.appointment.updateMany).not.toHaveBeenCalled();
  });

  it("Fisioterapeuta não registra em nome de outro profissional", async () => {
    as("FISIOTERAPEUTA");
    const result = await createSession("p1", undefined, form({ ...valid, professionalId: "f2" }));
    expect(result?.fieldErrors?.professionalId?.[0]).toMatch(/registra atendimentos realizados por você/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("ADMIN escolhe o fisioterapeuta; o autor continua sendo o ADMIN (sem CREFITO)", async () => {
    as("ADMIN");
    await createSession("p1", undefined, form({ ...valid, professionalId: "f2" })).catch(() => {});
    const { data } = tx.treatmentSession.create.mock.calls[0][0];
    expect(data).toMatchObject({ professionalId: "f2", professionalCrefitoSnapshot: "999-F", authorId: "uADMIN", authorCrefitoSnapshot: null });
    expect(tx.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "f2", role: "FISIOTERAPEUTA" } }));
  });

  it("responsável que não é fisioterapeuta é recusado", async () => {
    as("ADMIN");
    const result = await createSession("p1", undefined, form({ ...valid, professionalId: "uADMIN" }));
    expect(result).toEqual({ fieldErrors: { professionalId: ["Selecione um fisioterapeuta."] } });
    expectNoWrites();
  });

  it("plano de outro paciente, plano encerrado e revisão de outro plano são recusados", async () => {
    as("FISIOTERAPEUTA");
    tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) =>
      sql.join("?").includes('"TherapyPlan"') ? [] : [{ status: "ATIVO" }],
    );
    expect((await createSession("p1", undefined, form(valid)))?.fieldErrors?.planId).toEqual([
      "Selecione um plano deste paciente.",
    ]);
    tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) =>
      sql.join("?").includes('"TherapyPlan"') ? [{ status: "ENCERRADO" }] : [{ status: "ATIVO" }],
    );
    expect((await createSession("p1", undefined, form(valid)))?.fieldErrors?.planId?.[0]).toMatch(/Plano encerrado/);
    tx.$queryRaw.mockResolvedValue([{ status: "ATIVO" }]);
    expect((await createSession("p1", undefined, form({ ...valid, planRevisionId: "deoutro" })))?.fieldErrors?.planRevisionId).toEqual([
      "Selecione uma revisão deste plano.",
    ]);
    expectNoWrites();
  });

  it("antes do início do plano, ou com revisão posterior ao atendimento, é recusado", async () => {
    as("FISIOTERAPEUTA");
    expect((await createSession("p1", undefined, form({ ...valid, occurredDate: "2026-08-31" })))?.fieldErrors?.occurredDate?.[0]).toMatch(
      /anterior ao início do plano \(01\/09\/2026\)/,
    );
    expect((await createSession("p1", undefined, form({ ...valid, occurredDate: "2026-09-05" })))?.fieldErrors?.planRevisionId?.[0]).toMatch(
      /posterior à data do atendimento/,
    );
    expectNoWrites();
  });

  it("evolução vazia e data futura são recusadas sem ecoar conteúdo", async () => {
    as("FISIOTERAPEUTA");
    const result = await createSession("p1", undefined, form({ ...valid, evolution: " ", occurredDate: "2999-01-01", observations: SECRET.repeat(300) }));
    // A checagem de data futura combina data e hora, então aparece quando os demais campos são válidos.
    expect(Object.keys(result?.fieldErrors ?? {}).sort()).toEqual(["evolution", "observations"]);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    const future = await createSession("p1", undefined, form({ ...valid, occurredDate: "2999-01-01" }));
    expect(future).toEqual({ fieldErrors: { occurredDate: ["O atendimento não pode estar no futuro."] } });
    expectNoWrites();
  });

  it("reenvio com a mesma chave devolve o atendimento existente, sem duplicar", async () => {
    as("FISIOTERAPEUTA");
    tx.treatmentSession.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "7",
        meta: { target: ["idempotencyKey"] },
      }),
    );
    prismaMock.treatmentSession.findFirst.mockResolvedValue({ id: "s-existente" });
    await expect(createSession("p1", undefined, form(valid))).rejects.toMatchObject({ url: "/pacientes/p1/sessoes/s-existente" });
    expect(prismaMock.treatmentSession.findFirst).toHaveBeenLastCalledWith({
      where: { idempotencyKey: "req-0001-abcdef", patientId: "p1" },
      select: { id: true },
    });
  });

  it("paciente inativo, RECEPCAO e sessão inválida não gravam", async () => {
    as("FISIOTERAPEUTA");
    tx.$queryRaw.mockResolvedValue([{ status: "INATIVO" }]);
    expect((await createSession("p1", undefined, form(valid)))?.error).toMatch(/Paciente inativo/);
    for (const role of ["RECEPCAO", null]) {
      as(role);
      await expect(createSession("p1", undefined, form(valid))).resolves.toEqual({ error: "Acesso negado." });
    }
    expectNoWrites();
  });
});

describe("updateSession", () => {
  it("grava só os campos alterados, com motivo, valores legíveis e assinatura", async () => {
    as("ADMIN");
    await expect(
      updateSession("p1", "s1", undefined, editForm({ occurredTime: "15:00", professionalId: "f2", nextSteps: "Progredir carga" })),
    ).rejects.toMatchObject({ url: "/pacientes/p1/sessoes/s1" });
    expect(tx.treatmentSession.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "s1", patientId: "p1", version: 1, status: "VALIDO" },
      data: { version: 2, professionalId: "f2", professionalNameSnapshot: "Fisio f2", nextSteps: "Progredir carga" },
    });
    const { data } = tx.treatmentSessionChange.createMany.mock.calls[0][0];
    expect(data.map((change: { field: string }) => change.field)).toEqual(["occurredAt", "professional", "nextSteps"]);
    expect(data[0]).toMatchObject({ previousValue: "20/09/2026 14:30", newValue: "20/09/2026 15:00" });
    expect(data[1]).toMatchObject({ previousValue: "Bruna (CREFITO 123456-F)", newValue: "Fisio f2 (CREFITO 999-F)" });
    for (const change of data) {
      expect(change).toMatchObject({ sessionId: "s1", version: 2, reason: "Hora digitada errada", editorId: "uADMIN" });
    }
  });

  it("sem mudanças não grava nada", async () => {
    as("FISIOTERAPEUTA");
    await expect(updateSession("p1", "s1", undefined, editForm())).rejects.toMatchObject({ url: "/pacientes/p1/sessoes/s1" });
    expectNoWrites();
  });

  it("versão desatualizada ou corrida perdida: conflito, sem histórico", async () => {
    as("FISIOTERAPEUTA");
    tx.treatmentSession.findFirst.mockResolvedValueOnce({ ...storedSession, version: 2 });
    expect((await updateSession("p1", "s1", undefined, editForm({ evolution: "Outra" })))?.error).toMatch(/alterado por outra pessoa/);
    tx.treatmentSession.updateMany.mockResolvedValue({ count: 0 });
    expect((await updateSession("p1", "s1", undefined, editForm({ evolution: "Outra" })))?.error).toMatch(/alterado por outra pessoa/);
    expect(tx.treatmentSessionChange.createMany).not.toHaveBeenCalled();
  });

  it("atendimento invalidado, de outro paciente ou sem motivo não é corrigido", async () => {
    as("FISIOTERAPEUTA");
    tx.treatmentSession.findFirst.mockResolvedValueOnce({ ...storedSession, status: "INVALIDADO" });
    expect((await updateSession("p1", "s1", undefined, editForm({ evolution: "Outra" })))?.error).toMatch(/invalidado não pode/);
    tx.treatmentSession.findFirst.mockResolvedValueOnce(null);
    expect(await updateSession("p1", "alheio", undefined, editForm({ evolution: "Outra" }))).toEqual({ error: "Atendimento não encontrado." });
    expect((await updateSession("p1", "s1", undefined, editForm({ reason: "" })))?.fieldErrors?.reason).toBeDefined();
    expectNoWrites();
  });

  it("Fisioterapeuta não troca o responsável por outro profissional", async () => {
    as("FISIOTERAPEUTA");
    const result = await updateSession("p1", "s1", undefined, editForm({ professionalId: "f2" }));
    expect(result?.fieldErrors?.professionalId?.[0]).toMatch(/realizados por você/);
    expectNoWrites();
  });
});

describe("invalidateSession", () => {
  it("invalida com motivo e assinatura, sem apagar, e incrementa a versão", async () => {
    as("FISIOTERAPEUTA");
    expect(await invalidateSession("p1", "s1", undefined, form({ reason: "Lançada no paciente errado" }))).toEqual({
      ok: true,
      message: "Atendimento invalidado.",
    });
    expect(tx.treatmentSession.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "s1", patientId: "p1", status: "VALIDO" },
      data: {
        status: "INVALIDADO",
        invalidationReason: "Lançada no paciente errado",
        invalidatedById: "uFISIOTERAPEUTA",
        invalidatedByNameSnapshot: "Nome uFISIOTERAPEUTA",
        version: { increment: 1 },
      },
    });
    expect(tx.treatmentSession.delete).not.toHaveBeenCalled();
  });

  it("já invalidado, alheio, sem motivo e RECEPCAO", async () => {
    as("ADMIN");
    tx.treatmentSession.updateMany.mockResolvedValue({ count: 0 });
    tx.treatmentSession.findFirst.mockResolvedValueOnce({ id: "s1" }).mockResolvedValueOnce(null);
    expect((await invalidateSession("p1", "s1", undefined, form({ reason: "x" })))?.error).toBe("Este atendimento já foi invalidado.");
    expect((await invalidateSession("p1", "alheio", undefined, form({ reason: "x" })))?.error).toBe("Atendimento não encontrado.");
    expect((await invalidateSession("p1", "s1", undefined, form({ reason: "" })))?.fieldErrors?.reason).toBeDefined();
    as("RECEPCAO");
    expect(await invalidateSession("p1", "s1", undefined, form({ reason: "x" }))).toEqual({ error: "Acesso negado." });
  });
});
