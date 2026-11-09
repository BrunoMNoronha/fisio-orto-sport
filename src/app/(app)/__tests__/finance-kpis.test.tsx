import { render, screen } from "@testing-library/react";
import type { FinanceKpis as FinanceKpisData } from "@/modules/financeiro/kpi-read";
import { DELTA_MESSAGES } from "@/modules/financeiro/kpi-math";

const data = { value: null as FinanceKpisData | null };
jest.mock("@/modules/financeiro/kpi-queries", () => ({ getFinanceKpis: jest.fn(async () => data.value) }));

import { FinanceKpis, FinanceKpisSkeleton, buildFinanceKpiCards } from "../finance-kpis";

const sample: FinanceKpisData = {
  today: "2026-11-08",
  month: "2026-11",
  previousMonth: "2026-10",
  chargedCents: BigInt(125_000),
  previousChargedCents: BigInt(100_000),
  receivedCents: BigInt(5_000),
  previousReceivedCents: BigInt(0),
  openCents: BigInt(70_000),
  overdueCents: BigInt(1_500),
};

describe("FinanceKpis", () => {
  it("sem indicadores (sem permissão) não renderiza nada", async () => {
    data.value = null;
    const { container } = render(await FinanceKpis());
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra os quatro indicadores em BRL, a variação e os links já filtrados", async () => {
    data.value = sample;
    render(await FinanceKpis());
    expect(screen.getByRole("heading", { level: 2, name: "Financeiro de novembro de 2026" })).toBeInTheDocument();
    for (const label of ["Cobrado no mês", "Recebido no mês", "A receber", "Vencido"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const value of ["R$ 1.250,00", "R$ 50,00", "R$ 700,00", "R$ 15,00"]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByText("+25% vs. mês anterior")).toBeInTheDocument();
    expect(screen.getByText(DELTA_MESSAGES.new)).toBeInTheDocument();
    const hrefs = screen.getAllByRole("link", { name: /Ver detalhes/ }).map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual([
      "/financeiro",
      "/financeiro/relatorios/recebimentos?start=2026-11-01&end=2026-11-30",
      "/financeiro/relatorios/contas-a-receber",
      "/financeiro/relatorios/contas-a-receber?end=2026-11-07",
    ]);
  });

  it("destaca o vencido só quando há saldo vencido", () => {
    expect(buildFinanceKpiCards(sample).map((card) => card.alert)).toEqual([false, false, false, true]);
    expect(buildFinanceKpiCards({ ...sample, overdueCents: BigInt(0) })[3].alert).toBe(false);
  });

  it("o esqueleto anuncia o carregamento", () => {
    render(<FinanceKpisSkeleton />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Carregando indicadores financeiros…")).toBeInTheDocument();
  });
});
