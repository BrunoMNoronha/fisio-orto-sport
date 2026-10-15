jest.mock("@/modules/auth/dal", () => ({ requirePermission: jest.fn() }));
jest.mock("@/modules/financeiro/payment-queries", () => ({ getChargeFinancialDetail: jest.fn() }));
jest.mock("@/modules/financeiro/actions", () => ({ cancelChargeAction: jest.fn() }));
jest.mock("@/modules/financeiro/payment-actions", () => ({ reversePaymentAction: jest.fn() }));

import { render, screen } from "@testing-library/react";
import { requirePermission } from "@/modules/auth/dal";
import { getChargeFinancialDetail } from "@/modules/financeiro/payment-queries";
import DetailPage from "../[id]/page";

const original = {
  id: "p1", chargeId: "c1", amountCents: 3000, receivedOn: new Date("2026-09-01T00:00:00.000Z"),
  createdAt: new Date("2026-09-02T15:00:00.000Z"), createdBy: { name: "Recepção" }, reversal: null, replaces: null, replacedBy: null,
};
function detail(overrides: Record<string, unknown> = {}) {
  return {
    charge: {
      id: "c1", description: "Pacote outubro", amountCents: 10000, dueDate: new Date("2026-10-31T00:00:00.000Z"), status: "ATIVA",
      patient: { id: "pac1", fullName: "ANA", status: "INATIVO" }, createdBy: { name: "Admin" }, createdAt: new Date("2026-10-01T15:00:00.000Z"),
      cancelledBy: null, cancelledAt: null, cancelReason: null, replaces: null, replacedBy: null,
    },
    receivedCents: 3000, balanceCents: 7000, settlement: "Parcial", payments: [original], total: 1, page: 1, pageCount: 1, ...overrides,
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  (getChargeFinancialDetail as jest.Mock).mockResolvedValue(detail());
});

describe("detalhe financeiro FIN02", () => {
  it.each(["ADMIN", "RECEPCAO", "FISIOTERAPEUTA"])("%s vê saldo real e mesmas ações administrativas, inclusive paciente inativo", async (role) => {
    (requirePermission as jest.Mock).mockResolvedValue({ role });
    render(await DetailPage({ params: Promise.resolve({ id: "c1" }), searchParams: Promise.resolve({}) }));
    expect(screen.getByText("ANA (inativo)")).toBeInTheDocument();
    expect(screen.getByText("Recebido válido").nextElementSibling).toHaveTextContent("R$ 30,00");
    expect(screen.getByText("Saldo").nextElementSibling).toHaveTextContent("R$ 70,00");
    expect(screen.getByText("Parcial")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Registrar recebimento" })).toHaveAttribute("href", "/financeiro/c1/pagamentos/novo");
    expect(screen.getByRole("link", { name: "Corrigir" })).toHaveAttribute("href", "/financeiro/c1/pagamentos/p1/corrigir");
    expect(screen.getByRole("button", { name: "Estornar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar cobrança" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Substituir" })).not.toBeInTheDocument();
  });
  it("histórico estornado preserva autoria/motivo e permite substituto explícito", async () => {
    (requirePermission as jest.Mock).mockResolvedValue({ role: "RECEPCAO" });
    (getChargeFinancialDetail as jest.Mock).mockResolvedValue(detail({
      receivedCents: 0, balanceCents: 10000, settlement: "Aberta",
      payments: [{ ...original, reversal: { id: "r1", reason: "Valor incorreto", reversedOn: new Date("2026-09-03T00:00:00.000Z"), createdAt: new Date("2026-09-04T15:00:00.000Z"), createdBy: { name: "Fisioterapeuta" } } }],
    }));
    render(await DetailPage({ params: Promise.resolve({ id: "c1" }), searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Estornado")).toBeInTheDocument();
    expect(screen.getByText("Valor incorreto")).toBeInTheDocument();
    expect(screen.getByText(/por Fisioterapeuta/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Registrar substituto" })).toHaveAttribute("href", "/financeiro/c1/pagamentos/novo?replacesPaymentId=p1");
    expect(screen.getByRole("button", { name: "Cancelar cobrança" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Corrigir" })).not.toBeInTheDocument();
  });
  it("quitada impede novo recebimento, mantém correção/estorno e pagina sem mudar totais", async () => {
    (requirePermission as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (getChargeFinancialDetail as jest.Mock).mockResolvedValue(detail({ receivedCents: 10000, balanceCents: 0, settlement: "Quitada", page: 2, pageCount: 3, total: 45 }));
    render(await DetailPage({ params: Promise.resolve({ id: "c1" }), searchParams: Promise.resolve({ page: "2" }) }));
    expect(getChargeFinancialDetail).toHaveBeenCalledWith("c1", 2);
    expect(screen.getByText("Saldo").nextElementSibling).toHaveTextContent("R$ 0,00");
    expect(screen.queryByRole("link", { name: "Registrar recebimento" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Corrigir" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute("href", "/financeiro/c1?page=1#pagamentos");
    expect(screen.getByRole("link", { name: "Próxima" })).toHaveAttribute("href", "/financeiro/c1?page=3#pagamentos");
    expect(screen.getByText("45 pagamentos")).toBeInTheDocument();
  });
});
