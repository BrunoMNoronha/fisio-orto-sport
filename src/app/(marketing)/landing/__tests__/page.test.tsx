import { render, screen, within } from "@testing-library/react";
import { APP_LOGIN_URL, CONTACT_EMAIL } from "../landing-content";
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

  it("demonstração e contato com a equipe abrem um e-mail para o comercial", () => {
    render(<LandingPage />);
    const demo = screen.getAllByRole("link", { name: /Agendar demonstração/ });
    const team = screen.getAllByRole("link", { name: "Falar com a equipe" });
    expect(demo.length).toBeGreaterThanOrEqual(3);
    expect(team).toHaveLength(2);
    for (const link of [...demo, ...team]) {
      const href = link.getAttribute("href") ?? "";
      expect(href.startsWith(`mailto:${CONTACT_EMAIL}?subject=`)).toBe(true);
    }
    expect(demo[0]).toHaveAttribute("href", expect.stringContaining(encodeURIComponent("Demonstração do TechLab+ Fisio")));
    expect(team[0]).toHaveAttribute("href", expect.stringContaining(encodeURIComponent("Falar com a equipe")));
    expect(screen.getByRole("link", { name: CONTACT_EMAIL })).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
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
    expect(within(header).getAllByRole("link", { name: "Entrar" })[0]).toHaveAttribute("href", APP_LOGIN_URL);
    expect(APP_LOGIN_URL).toBe("https://fisio-orto-sport.vercel.app/login");
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

  it("lista os seis módulos e os três planos com os valores calculados", () => {
    render(<LandingPage />);
    for (const name of ["Pacientes", "Agenda", "Prontuário clínico", "Financeiro", "Convênios TISS", "Administração"]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
    for (const plan of ["Essencial", "Clínica", "Convênios"]) {
      expect(screen.getByRole("heading", { level: 3, name: plan })).toBeInTheDocument();
    }
    for (const price of ["R$ 149", "R$ 299", "R$ 449"]) {
      expect(screen.getByText(price)).toBeInTheDocument();
    }
    expect(screen.queryByText(/\[VALOR\]/)).not.toBeInTheDocument();
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
