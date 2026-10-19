import { render, screen, within } from "@testing-library/react";
import { AgendaLegend, LEGEND } from "../agenda-legend";

describe("AgendaLegend", () => {
  it("lista as sete situações na versão ampla e na recolhida (mobile)", () => {
    render(<AgendaLegend />);
    const lists = screen.getAllByRole("list", { name: "Legenda" });
    expect(lists).toHaveLength(2);
    for (const list of lists) {
      expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual(
        LEGEND.map((entry) => entry.label),
      );
    }
  });

  it("a versão recolhida é um <details> fechado com resumo 'Legenda'", () => {
    const { container } = render(<AgendaLegend />);
    const details = container.querySelector("details");
    expect(details).not.toHaveAttribute("open");
    expect(details?.querySelector("summary")).toHaveTextContent("Legenda");
  });

  it("agendada é vazada e reagendada é azul, como nos cards", () => {
    expect(LEGEND.find((entry) => entry.label === "Agendada")?.swatch).toContain("ring-primary");
    expect(LEGEND.find((entry) => entry.label === "Reagendada")?.swatch).toContain("bg-blue-600");
    expect(LEGEND.find((entry) => entry.label === "Faltou, avisou")?.swatch).toContain("repeating-linear-gradient");
  });
});
