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
    [{ attendance: "FALTA_NAO_AVISADA" }, "Faltou (sem aviso)", "bg-red-100", "lucide-user-x"],
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

  it("falta avisada tem fundo listrado; sem aviso, vermelho cheio", () => {
    renderDay({ ...base, attendance: "FALTA_AVISADA" });
    const notice = screen.getByRole("link", { name: /Faltou \(avisou\)$/ });
    expect(notice.className).toContain("repeating-linear-gradient");
    expect(notice).not.toHaveClass("bg-red-100");
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
    const first = screen.getByRole("link", { name: /^14:00–15:00/ });
    const overlapping = screen.getByRole("link", { name: /^14:30–15:30/ });
    const alone = screen.getByRole("link", { name: /^17:00–18:00/ });
    expect(first.style.getPropertyValue("--lane")).toBe("0");
    expect(first.style.getPropertyValue("--lanes")).toBe("2");
    expect(overlapping.style.getPropertyValue("--lane")).toBe("1");
    expect(alone.style.getPropertyValue("--lanes")).toBe("1");
  });

  it("em coluna estreita o card sobreposto fica em cascata, elevado e com largura cheia", () => {
    render(
      <AgendaDayGrid
        date="2026-10-19"
        items={[base, { ...base, id: "a2", startsAt: new Date("2026-10-19T17:30:00Z"), endsAt: new Date("2026-10-19T18:30:00Z") }]}
        professionals={professionals}
        canManage
      />,
    );
    const overlapping = screen.getByRole("link", { name: /^14:30–15:30/ });
    expect(overlapping).toHaveClass("right-1", "left-[calc(var(--lane)*1.5rem+4px)]", "ring-2", "@[22rem]/col:w-[calc(100%/var(--lanes)-8px)]");
    expect(overlapping).toHaveStyle({ zIndex: "3" });
    expect(screen.getByRole("link", { name: /^14:00–15:00/ })).not.toHaveClass("ring-2");
  });

  it("cabeçalho resume o dia por situação, sem canceladas e sem contagens zeradas", () => {
    const at = (hour: number) => ({ startsAt: new Date(`2026-10-19T${hour}:00:00Z`), endsAt: new Date(`2026-10-19T${hour}:30:00Z`) });
    render(
      <AgendaDayGrid
        date="2026-10-19"
        items={[
          base,
          { ...base, id: "a2", ...at(18), attendance: "COMPARECEU" },
          { ...base, id: "a3", ...at(19), attendance: "COMPARECEU" },
          { ...base, id: "a4", ...at(20), attendance: "FALTA_AVISADA" },
          { ...base, id: "a5", ...at(21), status: "CANCELADO" },
        ]}
        professionals={professionals}
        canManage
      />,
    );
    expect(screen.getByText("1 agendamento · 2 compareceram · 1 falta")).toBeInTheDocument();
    expect(screen.getByText("1 agend. · 2 comp. · 1 falta")).toBeInTheDocument();
  });

  it("dia sem agendamentos mostra o aviso no cabeçalho", () => {
    render(<AgendaDayGrid date="2026-10-19" items={[]} professionals={professionals} canManage />);
    expect(screen.getByText("Nenhum agendamento")).toBeInTheDocument();
  });

  it("linha do agora traz a hora na calha só no dia de hoje", () => {
    const now = new Date("2026-10-19T13:48:00Z");
    const { rerender } = render(<AgendaDayGrid date="2026-10-19" items={[]} professionals={professionals} canManage now={now} />);
    expect(screen.getByText("10:48")).toHaveAttribute("aria-hidden");
    rerender(<AgendaDayGrid date="2026-10-20" items={[]} professionals={professionals} canManage now={now} />);
    expect(screen.queryByText("10:48")).not.toBeInTheDocument();
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
