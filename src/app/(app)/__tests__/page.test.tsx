import { render, screen } from "@testing-library/react";
import Home from "../page";

const user = { id: "u1", name: "Ana Souza", email: "ana@example.com", role: "ADMIN" };
jest.mock("@/modules/auth/dal", () => ({
  requireUser: jest.fn(async () => user),
}));

jest.mock("@/modules/pacientes/queries", () => ({
  listPatients: jest.fn().mockResolvedValue({ items: [], total: 12, page: 1, pageCount: 1 }),
}));

jest.mock("@/modules/agenda/queries", () => ({
  listAgenda: jest.fn().mockResolvedValue([]),
}));

const tour = { seen: false };
jest.mock("@/modules/onboarding/queries", () => ({
  hasSeenFinanceTour: jest.fn(async () => tour.seen),
}));

// Componente assíncrono de servidor: substituído por um stub síncrono, testado à parte.
jest.mock("../finance-kpis", () => ({
  FinanceKpis: () => <section>Indicadores financeiros</section>,
  FinanceKpisSkeleton: () => null,
}));

jest.mock("../home-tour-loader", () => ({
  HomeTourLoader: ({ showTour }: { showTour: boolean }) => (showTour ? <div>Tour do financeiro</div> : null),
}));

import { hasSeenFinanceTour } from "@/modules/onboarding/queries";

beforeEach(() => {
  jest.clearAllMocks();
  user.role = "ADMIN";
  tour.seen = false;
});

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
    expect(screen.getByText("Indicadores financeiros")).toBeInTheDocument();
  });

  it("não lista mais módulos em construção (a Fase 4 clínica está disponível)", async () => {
    render(await Home());
    expect(screen.queryByText("Em construção")).not.toBeInTheDocument();
    expect(screen.queryByText("Em breve")).not.toBeInTheDocument();
  });

  it("mostra o tour do financeiro na primeira visita do usuário da sessão", async () => {
    render(await Home());
    expect(hasSeenFinanceTour).toHaveBeenCalledWith("u1");
    expect(screen.getByText("Tour do financeiro")).toBeInTheDocument();
  });

  it("não repete o tour para quem já viu", async () => {
    tour.seen = true;
    render(await Home());
    expect(screen.queryByText("Tour do financeiro")).not.toBeInTheDocument();
  });

  it("sem financeiro:ler não consulta o tour nem mostra a seção financeira", async () => {
    user.role = "INEXISTENTE";
    render(await Home());
    expect(hasSeenFinanceTour).not.toHaveBeenCalled();
    expect(screen.queryByText("Indicadores financeiros")).not.toBeInTheDocument();
    expect(screen.queryByText("Tour do financeiro")).not.toBeInTheDocument();
  });
});
