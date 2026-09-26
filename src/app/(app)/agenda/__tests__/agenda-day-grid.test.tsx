import { render, screen } from "@testing-library/react";
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
