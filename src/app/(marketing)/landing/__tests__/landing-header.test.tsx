import { fireEvent, render, screen } from "@testing-library/react";
import { APP_LOGIN_URL, DEMO_MAILTO } from "../landing-content";
import { LandingHeader } from "../landing-header";

// No celular a navegação recolhe num botão; o painel fecha ao escolher um destino.
describe("LandingHeader", () => {
  it("abre e fecha o menu do celular pelo botão", () => {
    render(<LandingHeader />);
    const button = screen.getByRole("button", { name: "Abrir menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Fechar menu" })).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("navigation", { name: "Menu" });
    expect(menu).toHaveTextContent("Produto");
    expect(menu).toHaveTextContent("FAQ");

    fireEvent.click(screen.getByRole("button", { name: "Fechar menu" }));
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();
  });

  it("fecha o menu ao escolher um destino", () => {
    render(<LandingHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    const menu = screen.getByRole("navigation", { name: "Menu" });
    fireEvent.click(menu.querySelector('a[href="#planos"]')!);
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();
  });

  it("aponta Entrar para o login do app e a demonstração para o e-mail comercial", () => {
    render(<LandingHeader />);
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", APP_LOGIN_URL);
    expect(screen.getByRole("link", { name: "Agendar demonstração" })).toHaveAttribute("href", DEMO_MAILTO);
    expect(DEMO_MAILTO.startsWith("mailto:bruno.developer@pm.me?subject=")).toBe(true);
  });
});
