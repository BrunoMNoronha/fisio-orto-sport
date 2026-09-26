import { render, screen } from "@testing-library/react";
import { AppBreadcrumb } from "../app-breadcrumb";

const pathname = { current: "/" };
jest.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

describe("AppBreadcrumb", () => {
  it("aba Documentos da ficha: Pacientes › Detalhes › Documentos", () => {
    pathname.current = "/pacientes/p1/documentos";
    render(<AppBreadcrumb />);
    expect(screen.getByRole("link", { name: "Pacientes" })).toHaveAttribute("href", "/pacientes");
    expect(screen.getByRole("link", { name: "Detalhes" })).toHaveAttribute("href", "/pacientes/p1");
    expect(screen.getByText("Documentos")).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByText("Detalhes")).toHaveLength(1);
  });

  it("nova avaliação: Pacientes › Detalhes › Avaliações › Nova avaliação", () => {
    pathname.current = "/pacientes/p1/avaliacoes/nova";
    render(<AppBreadcrumb />);
    expect(screen.getByRole("link", { name: "Avaliações" })).toHaveAttribute("href", "/pacientes/p1/avaliacoes");
    expect(screen.getByText("Nova avaliação")).toHaveAttribute("aria-current", "page");
  });

  it("anamnese continua com \"Nova versão\"", () => {
    pathname.current = "/pacientes/p1/anamnese/nova";
    render(<AppBreadcrumb />);
    expect(screen.getByText("Nova versão")).toHaveAttribute("aria-current", "page");
  });

  it("planos: Novo plano e revisões", () => {
    pathname.current = "/pacientes/p1/planos/novo";
    const { unmount } = render(<AppBreadcrumb />);
    expect(screen.getByRole("link", { name: "Planos" })).toHaveAttribute("href", "/pacientes/p1/planos");
    expect(screen.getByText("Novo plano")).toHaveAttribute("aria-current", "page");
    unmount();
    pathname.current = "/pacientes/p1/planos/pl1/revisar";
    render(<AppBreadcrumb />);
    expect(screen.getByText("Revisar")).toHaveAttribute("aria-current", "page");
  });

  it("sessões: Nova sessão", () => {
    pathname.current = "/pacientes/p1/sessoes/nova";
    render(<AppBreadcrumb />);
    expect(screen.getByRole("link", { name: "Sessões" })).toHaveAttribute("href", "/pacientes/p1/sessoes");
    expect(screen.getByText("Nova sessão")).toHaveAttribute("aria-current", "page");
  });
});
