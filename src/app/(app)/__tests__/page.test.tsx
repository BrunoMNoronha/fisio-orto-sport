import { render, screen } from "@testing-library/react";
import Home from "../page";

jest.mock("@/modules/auth/dal", () => ({
  requireUser: jest.fn().mockResolvedValue({
    id: "u1",
    name: "Ana Souza",
    email: "ana@example.com",
    role: "ADMIN",
  }),
}));

jest.mock("@/modules/pacientes/queries", () => ({
  listPatients: jest.fn().mockResolvedValue({ items: [], total: 12, page: 1, pageCount: 1 }),
}));

jest.mock("@/modules/agenda/queries", () => ({
  listAgenda: jest.fn().mockResolvedValue([]),
}));

describe("Home", () => {
  it("saúda o usuário pelo primeiro nome", async () => {
    render(await Home());
    expect(screen.getByRole("heading", { level: 1, name: "Olá, Ana" })).toBeInTheDocument();
  });

  it("exibe os indicadores permitidos ao perfil", async () => {
    render(await Home());
    expect(screen.getByText("Pacientes ativos")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Agendamentos hoje")).toBeInTheDocument();
    expect(screen.getByText("Nenhum atendimento hoje.")).toBeInTheDocument();
  });

  it("lista os módulos em construção", async () => {
    render(await Home());
    expect(screen.getAllByText("Em breve")).toHaveLength(3);
  });
});
