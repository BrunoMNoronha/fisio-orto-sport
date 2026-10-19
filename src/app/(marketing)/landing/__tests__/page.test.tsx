import { render, screen, within } from "@testing-library/react";
import LandingPage, { metadata } from "../page";

// Landing pública do produto: fiel ao mockup e restrita ao que a documentação descreve.
describe("Landing page", () => {
  it("define título e descrição próprios", () => {
    expect(metadata.title).toBe("TechLab+ Fisio — Gestão para clínicas de fisioterapia");
    expect(metadata.description).toMatch(/clínicas de fisioterapia|prontuário/i);
  });

  it("apresenta o hero com a proposta e as chamadas para ação", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Gestão clínica organizada. Atendimento com continuidade. Evolução acompanhada.",
      }),
    ).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("link", { name: /Agendar demonstração/ }).length).toBeGreaterThanOrEqual(2);
    expect(within(main).getByRole("link", { name: "Ver os módulos" })).toHaveAttribute("href", "#modulos");
  });

  it("navega pelas seções e leva ao login do app", () => {
    render(<LandingPage />);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "#produto",
      "#modulos",
      "#seguranca",
      "#planos",
      "#faq",
    ]);
    const header = screen.getByRole("banner");
    expect(within(header).getAllByRole("link", { name: "Entrar" })[0]).toHaveAttribute("href", "/login");
  });

  it("mostra todas as seções do mockup com os mocks das telas", () => {
    render(<LandingPage />);
    for (const title of [
      "Um fluxo só, do primeiro contato à alta",
      "Tudo o que a clínica usa no dia a dia, em um lugar só",
      "Continuidade de verdade entre uma sessão e a próxima",
      "Da sessão atendida ao XML TISS aceito pela operadora",
      "Dado clínico é dado sensível. O sistema trata assim.",
      "Comece pela agenda. Cresça para convênios.",
      "O que as clínicas perguntam antes de migrar",
      "Veja a agenda, o prontuário e o faturamento com os dados da sua clínica",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
    expect(screen.getByRole("img", { name: /agenda na visão Dia/ })).toHaveTextContent("Ana Paula Ribeiro");
    expect(screen.getByRole("img", { name: /ficha do paciente/ })).toHaveTextContent("Carla Souza");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("© 2026 TechLab+ · Fisio");
  });

  it("lista os seis módulos e os três planos com valores ainda em placeholder", () => {
    render(<LandingPage />);
    for (const name of ["Pacientes", "Agenda", "Prontuário clínico", "Financeiro", "Convênios TISS", "Administração"]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
    for (const plan of ["Essencial", "Clínica", "Convênios"]) {
      expect(screen.getByRole("heading", { level: 3, name: plan })).toBeInTheDocument();
    }
    expect(screen.getAllByText(/R\$ \[VALOR\]/)).toHaveLength(3);
    expect(screen.getByText("Recomendado")).toBeInTheDocument();
  });

  it("responde às perguntas frequentes em details/summary, com a primeira aberta", () => {
    const { container } = render(<LandingPage />);
    const items = container.querySelectorAll("#faq details");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveAttribute("open");
    expect(items[1]).not.toHaveAttribute("open");
    expect(screen.getByText("Funciona no celular?")).toBeInTheDocument();
  });

  it("não promete funcionalidades fora da documentação", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/whatsapp|inteligência artificial|\bIA\b|app store|play store/i);
  });
});
