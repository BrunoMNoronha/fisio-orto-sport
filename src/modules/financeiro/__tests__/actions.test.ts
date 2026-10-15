/** @jest-environment node */
// Chamada direta das Server Actions do financeiro: a recusa acontece no servidor, antes de qualquer
// consulta ou escrita, sem depender de a UI esconder os botões.
const currentUser = { current: null as null | { id: string; name: string; email: string; role: string } };

jest.mock("@/modules/auth/dal", () => {
  const { can } = jest.requireActual("@/modules/auth/permissions");
  class AuthorizationError extends Error {}
  return {
    AuthorizationError,
    // Sem sessão (anônimo) ou usuário inativo: getCurrentUser devolve null e a action é negada.
    assertPermission: jest.fn(async (permission: string) => {
      if (!currentUser.current || !can(currentUser.current.role, permission)) throw new AuthorizationError();
      return currentUser.current;
    }),
  };
});

const prismaMock = { patient: { findMany: jest.fn() }, charge: {}, $transaction: jest.fn() };
jest.mock("@/lib/db", () => ({
  get prisma() {
    return prismaMock;
  },
}));

jest.mock("../service", () => {
  const actual = jest.requireActual("../service");
  return { ...actual, createCharge: jest.fn(), cancelCharge: jest.fn(), replaceCharge: jest.fn() };
});

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

import { revalidatePath } from "next/cache";
import { cancelChargeAction, createChargeAction, replaceChargeAction, searchChargePatients } from "../actions";
import {
  ALREADY_CANCELLED,
  ChargeRuleError,
  HAS_VALID_PAYMENTS,
  KEY_MISMATCH,
  PATIENT_NOT_FOUND,
  cancelCharge,
  createCharge,
  replaceCharge,
} from "../service";

const createMock = createCharge as jest.Mock;
const cancelMock = cancelCharge as jest.Mock;
const replaceMock = replaceCharge as jest.Mock;

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function as(role: string | null) {
  currentUser.current = role ? { id: `u-${role}`, name: role, email: `${role}@example.com`, role } : null;
}

const charge = {
  patientId: "cpatient1",
  description: "Pacote outubro",
  amount: "350,00",
  dueDate: "2026-10-31",
  requestId: "req-0001-abcdef",
  // Campos forjados no formulário são ignorados: autoria vem da sessão.
  createdById: "u-forjado",
};

beforeEach(() => {
  jest.clearAllMocks();
  as(null);
  createMock.mockResolvedValue({ id: "c1", created: true });
  cancelMock.mockResolvedValue({ alreadyCancelled: false });
  replaceMock.mockResolvedValue({ id: "c2", created: true });
  prismaMock.patient.findMany.mockResolvedValue([]);
});

describe("autorização no servidor", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["createChargeAction", () => createChargeAction(undefined, form(charge))],
    ["cancelChargeAction", () => cancelChargeAction(undefined, form({ id: "c1", reason: "Duplicada" }))],
    ["replaceChargeAction", () => replaceChargeAction(undefined, form({ ...charge, id: "c1", reason: "Valor errado" }))],
    ["searchChargePatients", () => searchChargePatients("ana")],
  ];

  it.each(calls)("%s: anônimo ou inativo (sem sessão) é negado antes de consultar ou gravar", async (_name, call) => {
    as(null);
    expect(await call()).toEqual({ error: "Acesso negado." });
    expect(createMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(prismaMock.patient.findMany).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "RECEPCAO", "FISIOTERAPEUTA"])("%s cria, cancela e substitui com autoria da sessão", async (role) => {
    as(role);
    await expect(createChargeAction(undefined, form(charge))).rejects.toMatchObject({ url: "/financeiro/c1" });
    expect(createMock).toHaveBeenCalledWith(expect.anything(), `u-${role}`, {
      patientId: "cpatient1",
      description: "Pacote outubro",
      amountCents: 35_000,
      dueDate: new Date("2026-10-31T00:00:00.000Z"),
      requestId: "req-0001-abcdef",
    });

    expect(await cancelChargeAction(undefined, form({ id: "c1", reason: "Duplicada" }))).toEqual({
      ok: true,
      message: "Cobrança cancelada.",
    });
    expect(cancelMock).toHaveBeenCalledWith(expect.anything(), `u-${role}`, { chargeId: "c1", reason: "Duplicada" });

    await expect(
      replaceChargeAction(undefined, form({ ...charge, amount: "300,00", id: "c1", reason: "Valor errado" })),
    ).rejects.toMatchObject({ url: "/financeiro/c2" });
    expect(replaceMock).toHaveBeenCalledWith(expect.anything(), `u-${role}`, {
      patientId: "cpatient1",
      description: "Pacote outubro",
      amountCents: 30_000,
      dueDate: new Date("2026-10-31T00:00:00.000Z"),
      chargeId: "c1",
      reason: "Valor errado",
      requestId: "req-0001-abcdef",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/financeiro", "layout");
  });
});

describe("validação antes do serviço", () => {
  beforeEach(() => as("RECEPCAO"));

  it.each([
    [{ amount: "0" }, "amount"],
    [{ amount: "-5" }, "amount"],
    [{ amount: "10,005" }, "amount"],
    [{ description: "  " }, "description"],
    [{ dueDate: "2026-13-01" }, "dueDate"],
    [{ patientId: "" }, "patientId"],
  ])("%j não chega ao banco", async (override, field) => {
    const result = await createChargeAction(undefined, form({ ...charge, ...override }));
    expect(result?.fieldErrors?.[field]).toHaveLength(1);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("cancelamento e substituição sem motivo não chegam ao banco", async () => {
    expect((await cancelChargeAction(undefined, form({ id: "c1", reason: "" })))?.fieldErrors?.reason).toHaveLength(1);
    expect((await replaceChargeAction(undefined, form({ ...charge, id: "c1" })))?.fieldErrors?.reason).toHaveLength(1);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe("respostas das regras do serviço", () => {
  beforeEach(() => as("FISIOTERAPEUTA"));

  it("paciente inexistente vira erro do campo", async () => {
    createMock.mockRejectedValue(new ChargeRuleError(PATIENT_NOT_FOUND, "patientId"));
    expect(await createChargeAction(undefined, form(charge))).toEqual({ fieldErrors: { patientId: [PATIENT_NOT_FOUND] } });
  });

  it("chave reutilizada com outro conteúdo é recusada", async () => {
    createMock.mockRejectedValue(new ChargeRuleError(KEY_MISMATCH));
    expect(await createChargeAction(undefined, form(charge))).toEqual({ error: KEY_MISMATCH });
  });

  it("reenvio com o mesmo conteúdo leva à cobrança já criada", async () => {
    createMock.mockResolvedValue({ id: "c-existente", created: false });
    await expect(createChargeAction(undefined, form(charge))).rejects.toMatchObject({ url: "/financeiro/c-existente" });
  });

  it("repetir o cancelamento informa sem alterar", async () => {
    cancelMock.mockResolvedValue({ alreadyCancelled: true });
    expect(await cancelChargeAction(undefined, form({ id: "c1", reason: "x" }))).toEqual({
      ok: true,
      message: "Esta cobrança já estava cancelada; nada foi alterado.",
    });
  });

  it("pagamento válido e original já cancelada recusam a operação", async () => {
    cancelMock.mockRejectedValue(new ChargeRuleError(HAS_VALID_PAYMENTS));
    expect(await cancelChargeAction(undefined, form({ id: "c1", reason: "x" }))).toEqual({ error: HAS_VALID_PAYMENTS });
    replaceMock.mockRejectedValue(new ChargeRuleError(ALREADY_CANCELLED));
    expect(await replaceChargeAction(undefined, form({ ...charge, id: "c1", reason: "x" }))).toEqual({ error: ALREADY_CANCELLED });
  });

  it("erro inesperado não é engolido", async () => {
    createMock.mockRejectedValue(new Error("falha de conexão"));
    await expect(createChargeAction(undefined, form(charge))).rejects.toThrow("falha de conexão");
  });
});

describe("searchChargePatients", () => {
  beforeEach(() => as("RECEPCAO"));

  it("busca qualquer paciente (ativo ou inativo), só id e nome, sem acentos", async () => {
    prismaMock.patient.findMany.mockResolvedValue([
      { id: "p1", fullName: "ANA", status: "ATIVO" },
      { id: "p2", fullName: "ANAÍS", status: "INATIVO" },
    ]);
    expect(await searchChargePatients("  Anaí ")).toEqual({
      items: [
        { id: "p1", label: "ANA" },
        { id: "p2", label: "ANAÍS (inativo)" },
      ],
      hasMore: false,
    });
    expect(prismaMock.patient.findMany).toHaveBeenCalledWith({
      where: { searchName: { contains: "anai" } },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      take: 21,
      select: { id: true, fullName: true, status: true },
    });
  });

  it("indica quando há mais resultados que o limite", async () => {
    prismaMock.patient.findMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, i) => ({ id: `p${i}`, fullName: `P${i}`, status: "ATIVO" })),
    );
    const result = await searchChargePatients("");
    expect("items" in result && result.items).toHaveLength(20);
    expect("hasMore" in result && result.hasMore).toBe(true);
  });
});
