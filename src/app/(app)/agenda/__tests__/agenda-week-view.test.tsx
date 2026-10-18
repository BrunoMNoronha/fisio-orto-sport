import { render, screen, within } from "@testing-library/react";
import type { AgendaItem } from "@/modules/agenda/queries";
import { AgendaWeekView } from "../agenda-week-view";

const base: AgendaItem = {
  id: "a1", status: "AGENDADO", attendance: null, lastRescheduledAt: null,
  startsAt: new Date("2026-10-19T17:00:00Z"), endsAt: new Date("2026-10-19T18:00:00Z"),
  patient: { id: "p1", fullName: "Paciente Teste" }, professional: { id: "f1", name: "Profissional Teste" },
};

const renderWeek = (item: AgendaItem, professionalId?: string) =>
  render(<AgendaWeekView from="2026-10-19" today="2026-10-19" items={[item]} professionalId={professionalId} />);

describe("AgendaWeekView — situações", () => {
  it.each([
    [{}, "Agendada", "border-primary", "lucide-calendar"],
    [{ attendance: "COMPARECEU" }, "Compareceu", "border-green-600", "lucide-circle-check"],
    [{ attendance: "FALTA_AVISADA" }, "Faltou (avisou)", "border-red-600", "lucide-user-x"],
    [{ attendance: "FALTA_NAO_AVISADA" }, "Faltou (sem aviso)", "border-red-600", "lucide-user-x"],
    [{ lastRescheduledAt: new Date() }, "Reagendada", "border-blue-600", "lucide-calendar-clock"],
    [{ lastRescheduledAt: new Date(), attendance: "COMPARECEU" }, "Compareceu", "border-green-600", "lucide-circle-check"],
    [{ lastRescheduledAt: new Date(), status: "CANCELADO" }, "Cancelada", "bg-muted", "lucide-circle-x"],
  ] as const)("card apresenta %s como %s", (changes, label, tone, icon) => {
    renderWeek({ ...base, ...changes });
    const link = screen.getByRole("link", { name: `14:00, Paciente Teste, ${label}, Profissional Teste` });
    expect(link).toHaveAttribute("href", "/agenda/a1");
    expect(link).toHaveClass(tone);
    expect(link).toHaveAttribute("title", `Paciente Teste · 14:00 · ${label}`);
    expect(link.querySelector("svg")).toHaveClass(icon);
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(within(link).getByText(label)).toBeInTheDocument();
  });

  it("com profissional filtrado, o nome acessível não repete o profissional", () => {
    renderWeek({ ...base, attendance: "FALTA_AVISADA" }, "f1");
    const link = screen.getByRole("link", { name: "14:00, Paciente Teste, Faltou (avisou)" });
    expect(within(link).queryByText("Profissional Teste")).not.toBeInTheDocument();
  });

  it("cancelada mantém o nome riscado e o visual apagado", () => {
    renderWeek({ ...base, status: "CANCELADO" });
    const link = screen.getByRole("link", { name: /Paciente Teste, Cancelada/ });
    expect(within(link).getByText("Paciente Teste")).toHaveClass("line-through");
    expect(link).toHaveClass("text-muted-foreground");
  });
});
