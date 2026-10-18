import { render, screen, within } from "@testing-library/react";
import type { AgendaItem } from "@/modules/agenda/queries";
import { AgendaDayGrid } from "../agenda-day-grid";

const professionals = [{ id: "f1", name: "Bruna Lima" }];

describe("AgendaDayGrid — horários livres", () => {
  it("cada link de horário livre tem texto acessível com hora e profissional", () => {
    render(<AgendaDayGrid date="2026-09-21" items={[]} professionals={professionals} canManage />);
    const link = screen.getByRole("link", { name: "Agendar às 09:00 com Bruna Lima" });
    expect(link).toHaveAttribute("href", "/agenda/novo?date=2026-09-21&professionalId=f1&start=09%3A00");
    for (const slot of screen.getAllByRole("link", { name: /^Agendar às/ })) expect(slot).toHaveAccessibleName();
  });

  it("sem permissão de gerir, não há links de agendamento", () => {
    render(<AgendaDayGrid date="2026-09-21" items={[]} professionals={professionals} canManage={false} />);
    expect(screen.queryByRole("link", { name: /^Agendar às/ })).not.toBeInTheDocument();
  });
});

const base: AgendaItem = {
  id: "a1", status: "AGENDADO", attendance: null, lastRescheduledAt: null,
  startsAt: new Date("2026-10-19T17:00:00Z"), endsAt: new Date("2026-10-19T18:00:00Z"),
  patient: { id: "p1", fullName: "Paciente Teste" }, professional: { id: "f1", name: "Bruna Lima" },
};

const renderDay = (item: AgendaItem) =>
  render(<AgendaDayGrid date="2026-10-19" items={[item]} professionals={professionals} canManage />);

describe("AgendaDayGrid — situações", () => {
  it.each([
    [{}, "Agendada", "border-primary", "lucide-calendar"],
    [{ attendance: "COMPARECEU" }, "Compareceu", "border-green-600", "lucide-circle-check"],
    [{ attendance: "FALTA_AVISADA" }, "Faltou (avisou)", "border-red-600", "lucide-user-x"],
    [{ attendance: "FALTA_NAO_AVISADA" }, "Faltou (sem aviso)", "border-red-600", "lucide-user-x"],
    [{ lastRescheduledAt: new Date() }, "Reagendada", "border-blue-600", "lucide-calendar-clock"],
    [{ lastRescheduledAt: new Date(), attendance: "COMPARECEU" }, "Compareceu", "border-green-600", "lucide-circle-check"],
    [{ lastRescheduledAt: new Date(), status: "CANCELADO" }, "Cancelada", "bg-muted", "lucide-circle-x"],
  ] as const)("card de 1 h apresenta %s como %s", (changes, label, tone, icon) => {
    renderDay({ ...base, ...changes });
    const link = screen.getByRole("link", { name: `14:00–15:00, Paciente Teste, ${label}` });
    expect(link).toHaveAttribute("href", "/agenda/a1");
    expect(link).toHaveClass(tone);
    expect(link).toHaveAttribute("title", expect.stringContaining(label));
    expect(link.querySelector("svg")).toHaveClass(icon);
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(within(link).getByText(`· ${label}`)).toBeInTheDocument();
  });

  it("agendada fica neutra e reagendada é o único card azul-claro", () => {
    render(
      <AgendaDayGrid
        date="2026-10-19"
        items={[base, { ...base, id: "a2", lastRescheduledAt: new Date(), startsAt: new Date("2026-10-19T18:00:00Z"), endsAt: new Date("2026-10-19T19:00:00Z") }]}
        professionals={professionals}
        canManage
      />,
    );
    const scheduled = screen.getByRole("link", { name: "14:00–15:00, Paciente Teste, Agendada" });
    const rescheduled = screen.getByRole("link", { name: "15:00–16:00, Paciente Teste, Reagendada" });
    expect(scheduled).toHaveClass("bg-card");
    expect(scheduled).not.toHaveClass("bg-blue-100");
    expect(rescheduled).toHaveClass("bg-blue-100");
  });

  it("cards só dividem a largura dentro do próprio grupo de sobreposição", () => {
    render(
      <AgendaDayGrid
        date="2026-10-19"
        items={[
          base,
          { ...base, id: "a2", startsAt: new Date("2026-10-19T17:30:00Z"), endsAt: new Date("2026-10-19T18:30:00Z") },
          { ...base, id: "a3", startsAt: new Date("2026-10-19T20:00:00Z"), endsAt: new Date("2026-10-19T21:00:00Z") },
        ]}
        professionals={professionals}
        canManage
      />,
    );
    expect(screen.getByRole("link", { name: /^14:00–15:00/ })).toHaveStyle({ width: "calc(50% - 8px)" });
    expect(screen.getByRole("link", { name: /^14:30–15:30/ })).toHaveStyle({ left: "calc(50% + 4px)" });
    expect(screen.getByRole("link", { name: /^17:00–18:00/ })).toHaveStyle({ width: "calc(100% - 8px)" });
  });

  it("contagem do cabeçalho usa plural real", () => {
    renderDay(base);
    expect(screen.getByText("1 agendamento")).toBeInTheDocument();
  });

  it("cancelada mantém o nome riscado e o visual apagado", () => {
    renderDay({ ...base, status: "CANCELADO" });
    const link = screen.getByRole("link", { name: "14:00–15:00, Paciente Teste, Cancelada" });
    expect(within(link).getByText("Paciente Teste")).toHaveClass("line-through");
    expect(link).toHaveClass("text-muted-foreground");
    expect(link).not.toHaveClass("border-primary");
  });

  it("card compacto (15 min) mostra só o ícone; a situação fica no nome acessível e no title", () => {
    renderDay({ ...base, attendance: "COMPARECEU", endsAt: new Date("2026-10-19T17:15:00Z") });
    const link = screen.getByRole("link", { name: "14:00–14:15, Paciente Teste, Compareceu" });
    expect(link).toHaveClass("flex-row");
    expect(link.querySelector("svg")).toHaveClass("lucide-circle-check");
    expect(within(link).queryByText(/Compareceu/)).not.toBeInTheDocument();
    expect(link).toHaveAttribute("title", "Paciente Teste · 14:00–14:15 · Compareceu");
  });
});
