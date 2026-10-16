import { render, screen } from "@testing-library/react";
import type { AgendaItem } from "@/modules/agenda/queries";
import { AgendaListView } from "../agenda-list-view";

const base: AgendaItem = {
  id: "a1", status: "AGENDADO", attendance: null, lastRescheduledAt: null,
  startsAt: new Date("2026-10-19T17:00:00Z"), endsAt: new Date("2026-10-19T18:00:00Z"),
  patient: { id: "p1", fullName: "Paciente Teste" }, professional: { id: "f1", name: "Profissional Teste" },
};

describe("AgendaListView — situações", () => {
  it.each([
    [{}, "Agendada", "text-slate-800", "lucide-calendar"],
    [{ attendance: "COMPARECEU" }, "Compareceu", "text-green-900", "lucide-circle-check"],
    [{ attendance: "FALTA_AVISADA" }, "Faltou (avisou)", "text-red-900", "lucide-user-x"],
    [{ attendance: "FALTA_NAO_AVISADA" }, "Faltou (sem aviso)", "text-red-900", "lucide-user-x"],
    [{ lastRescheduledAt: new Date() }, "Reagendada", "text-blue-900", "lucide-calendar-clock"],
    [{ lastRescheduledAt: new Date(), attendance: "COMPARECEU" }, "Compareceu", "text-green-900", "lucide-circle-check"],
    [{ lastRescheduledAt: new Date(), status: "CANCELADO" }, "Cancelada", "text-slate-800", "lucide-circle-x"],
  ] as const)("apresenta %s como %s", (changes, label, color, icon) => {
    render(<AgendaListView items={[{ ...base, ...changes }]} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveClass(color);
    expect(badge.querySelector("svg")).toHaveClass(icon);
    expect(badge.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("link", { name: "Paciente Teste" })).toHaveAttribute("href", "/agenda/a1");
  });

  it("mantém horário riscado no cancelamento", () => {
    render(<AgendaListView items={[{ ...base, status: "CANCELADO" }]} />);
    expect(screen.getByText("14:00–15:00")).toHaveClass("line-through");
  });

  it("mostra situação e aviso de expediente juntos", () => {
    render(<AgendaListView items={[{ ...base, lastRescheduledAt: new Date() }]} businessHours=";;;;;;" />);
    expect(screen.getByText("Reagendada")).toBeInTheDocument();
    expect(screen.getByText("Fora do expediente")).toBeInTheDocument();
  });

  it("remover presença volta a mostrar a marca de reagendamento", () => {
    const item = { ...base, lastRescheduledAt: new Date() };
    const { rerender } = render(<AgendaListView items={[{ ...item, attendance: "COMPARECEU" }]} />);
    expect(screen.getByText("Compareceu")).toBeInTheDocument();
    rerender(<AgendaListView items={[item]} />);
    expect(screen.getByText("Reagendada")).toBeInTheDocument();
  });
});
