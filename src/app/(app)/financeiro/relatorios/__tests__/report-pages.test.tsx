jest.mock("@/modules/auth/dal", () => ({ requirePermission: jest.fn() }));
jest.mock("@/modules/financeiro/report-queries", () => ({ getReceivablesReport: jest.fn(), getReceiptsReport: jest.fn() }));
jest.mock("@/modules/financeiro/actions", () => ({ searchChargePatients: jest.fn() }));
jest.mock("@/modules/agenda/actions", () => ({ searchActivePatients: jest.fn() }));

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { requirePermission } from "@/modules/auth/dal";
import { searchChargePatients } from "@/modules/financeiro/actions";
import { getReceivablesReport, getReceiptsReport } from "@/modules/financeiro/report-queries";
import ReceivablesPage from "../contas-a-receber/page";
import ReceiptsPage from "../recebimentos/page";
import { ReportFilters } from "../report-filters";

const patient = { id: "pac1", fullName: "ANA", status: "INATIVO" };
const filters = { patientId: "pac1", start: "2026-10-01", end: "2026-10-31", page: 2 };
const rawFilters = { patientId: "pac1", start: "2026-10-01", end: "2026-10-31", page: "2" };

function receivables() {
  return {
    error: null, filters, patient, total: 45, page: 2, pageCount: 3, pageSize: 20,
    totals: { chargedCents: BigInt(30000), receivedCents: BigInt(6000), balanceCents: BigInt(24000), overdueCents: BigInt(17000) },
    items: [
      { id: "c1", description: "Pacote outubro", dueDate: new Date("2026-10-07T00:00:00Z"), patient, amountCents: BigInt(10000), receivedCents: BigInt(3000), balanceCents: BigInt(7000), overdue: false },
      { id: "c2", description: "Sessões setembro", dueDate: new Date("2026-10-06T00:00:00Z"), patient, amountCents: BigInt(17000), receivedCents: BigInt(0), balanceCents: BigInt(17000), overdue: true },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  (requirePermission as jest.Mock).mockResolvedValue({ role: "RECEPCAO" });
  (getReceivablesReport as jest.Mock).mockResolvedValue(receivables());
  (searchChargePatients as jest.Mock).mockResolvedValue({ items: [{ id: "pac2", label: "BRUNO (inativo)" }], hasMore: false });
});
afterEach(() => jest.useRealTimers());

describe("relatórios financeiros FIN03", () => {
  it("mostra totais do filtro completo, saldo parcial, vencimento de hoje e links que preservam os filtros", async () => {
    render(await ReceivablesPage({ params: Promise.resolve({}), searchParams: Promise.resolve(rawFilters) }));

    expect(requirePermission).toHaveBeenCalledWith("financeiro:ler");
    expect(getReceivablesReport).toHaveBeenCalledWith(rawFilters, new Date("2026-10-07T12:00:00Z"));
    const totals = screen.getByRole("region", { name: "Totais do filtro" });
    expect(within(totals).getByText("Saldo a receber").nextElementSibling).toHaveTextContent("R$ 240,00");
    const items = screen.getByRole("region", { name: "Cobranças em aberto" });
    const first = within(items).getAllByRole("listitem")[0];
    expect(within(first).getByText("Valor da cobrança").nextElementSibling).toHaveTextContent("R$ 100,00");
    expect(within(first).getByText("Recebido válido").nextElementSibling).toHaveTextContent("R$ 30,00");
    expect(within(first).getByText("Saldo a receber").nextElementSibling).toHaveTextContent("R$ 70,00");
    expect(within(first).getByText("Pagamento parcial")).toBeInTheDocument();
    expect(within(first).getByText("Vence hoje")).toBeInTheDocument();
    expect(within(items).getByText("Vencida")).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: "Ver cobrança" })).toHaveAttribute("href", "/financeiro/c1");
    expect(screen.getByRole("link", { name: "Próxima" })).toHaveAttribute("href", "/financeiro/relatorios/contas-a-receber?patientId=pac1&start=2026-10-01&end=2026-10-31&page=3");
    expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute("href", "/financeiro/relatorios/contas-a-receber?patientId=pac1&start=2026-10-01&end=2026-10-31");
    expect(screen.getByRole("link", { name: "Recebimentos" })).toHaveAttribute("href", "/financeiro/relatorios/recebimentos?patientId=pac1&start=2026-10-01&end=2026-10-31");
    expect(screen.getByRole("link", { name: "Cobranças" })).toHaveAttribute("href", "/financeiro");
  });

  it("recebimentos mostram data civil e vínculo da cobrança, com total independente da página", async () => {
    (getReceiptsReport as jest.Mock).mockResolvedValue({
      error: null, filters, patient, total: 45, page: 2, pageCount: 3, pageSize: 20, totals: { receivedCents: BigInt(50000) },
      items: [{ id: "p1", chargeId: "c1", description: "Pacote outubro", receivedOn: new Date("2026-10-05T00:00:00Z"), amountCents: BigInt(3000), patient, replacesPaymentId: "p0" }],
    });
    render(await ReceiptsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(rawFilters) }));

    expect(getReceiptsReport).toHaveBeenCalledWith(rawFilters);
    expect(screen.getByText("Total recebido válido").nextElementSibling).toHaveTextContent("R$ 500,00");
    expect(screen.getByText("Recebido em 05/10/2026")).toBeInTheDocument();
    expect(screen.getByText("Recebimento substituto")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ANA (inativo)" })).toHaveAttribute("href", "/financeiro/c1");
    expect(screen.getByRole("link", { name: "Ver cobrança" })).toHaveAttribute("href", "/financeiro/c1");
    expect(screen.getByRole("link", { name: "Próxima" })).toHaveAttribute("href", "/financeiro/relatorios/recebimentos?patientId=pac1&start=2026-10-01&end=2026-10-31&page=3");
  });

  it.each([
    ["contas a receber", ReceivablesPage, getReceivablesReport],
    ["recebimentos", ReceiptsPage, getReceiptsReport],
  ] as const)("%s encaminha parâmetros repetidos intactos e mostra só erro, sem relatório ampliado", async (_label, Page, query) => {
    const raw = { patientId: "pac1", start: ["2026-10-01", "2026-10-02"], end: "2026-10-31" };
    (query as jest.Mock).mockResolvedValue({ error: "Não repita os filtros na URL.", filters: null, patient: null });
    render(await Page({ params: Promise.resolve({}), searchParams: Promise.resolve(raw) }));

    expect((query as jest.Mock).mock.calls[0][0]).toBe(raw);
    expect(screen.getByRole("alert")).toHaveTextContent("Não repita os filtros na URL.");
    expect(screen.queryByRole("region", { name: "Totais do filtro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Paginação do relatório" })).not.toBeInTheDocument();
    const form = screen.getByRole("search") as HTMLFormElement;
    expect(new FormData(form).get("patientId")).toBe("pac1");
    expect(screen.getByLabelText("Data final")).toHaveValue("2026-10-31");
    expect(screen.getByLabelText("Data inicial")).toHaveValue("");
  });

  it("CPF recusado não é exposto nem reenviado pelo formulário de correção", async () => {
    const cpf = "12345678901";
    (getReceivablesReport as jest.Mock).mockResolvedValue({ error: "Selecione um paciente válido. Não use CPF no filtro.", filters: null, patient: null });
    const { container } = render(await ReceivablesPage({ params: Promise.resolve({}), searchParams: Promise.resolve({ patientId: cpf }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Não use CPF no filtro.");
    expect(new FormData(screen.getByRole("search") as HTMLFormElement).get("patientId")).toBe("");
    expect(container.innerHTML).not.toContain(cpf);
  });

  it("filtro GET mantém paciente ao refinar busca, aceita seleção pelo teclado e remove só paciente", async () => {
    render(<ReportFilters action="/financeiro/relatorios/contas-a-receber" initialPatient={{ id: "pac1", label: "ANA (inativo)" }} start="2026-10-01" end="2026-10-31" dateLabel="Período por vencimento da cobrança" />);
    const form = screen.getByRole("search") as HTMLFormElement;
    const input = screen.getByRole("combobox", { name: "Paciente (opcional)" });
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/financeiro/relatorios/contas-a-receber");
    expect(new FormData(form).has("page")).toBe(false);
    fireEvent.change(input, { target: { value: "bru" } });
    expect(new FormData(form).get("patientId")).toBe("pac1");
    await act(async () => jest.advanceTimersByTime(300));
    expect(searchChargePatients).toHaveBeenCalledWith("bru");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(new FormData(form).get("patientId")).toBe("pac2");
    fireEvent.click(screen.getByRole("button", { name: "Remover paciente do filtro" }));
    expect(new FormData(form).get("patientId")).toBe("");
    expect(new FormData(form).get("start")).toBe("2026-10-01");
    expect(new FormData(form).get("end")).toBe("2026-10-31");
    expect(screen.getByRole("link", { name: "Limpar filtros" })).toHaveAttribute("href", "/financeiro/relatorios/contas-a-receber");
    fireEvent.click(screen.getByRole("link", { name: "Limpar filtros" }));
    expect(new FormData(form).get("start")).toBe("");
    expect(new FormData(form).get("end")).toBe("");
  });
});
