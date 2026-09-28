import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorFallback } from "../error-fallback";
import AppError from "@/app/(app)/error";
import RootError from "@/app/error";

// Issue #47: falhas inesperadas mostram tela em português, com código para o log e nova tentativa,
// em vez da página padrão do Next em inglês.
describe("ErrorFallback", () => {
  it("anuncia a falha em português com o código do log", () => {
    render(<ErrorFallback digest="2153836871" retry={jest.fn()} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar esta página");
    expect(alert).toHaveTextContent("Código: 2153836871");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Não foi possível carregar esta página");
    expect(screen.queryByText(/server error|couldn.t load/i)).not.toBeInTheDocument();
  });

  it("omite o código quando não há digest", () => {
    render(<ErrorFallback retry={jest.fn()} />);
    expect(screen.queryByText(/Código:/)).not.toBeInTheDocument();
  });

  it("tenta novamente e oferece volta ao início", () => {
    const retry = jest.fn();
    render(<ErrorFallback retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Voltar ao início" })).toHaveAttribute("href", "/");
  });

  it("é usado pelos limites de erro da raiz e da área autenticada", () => {
    const error = Object.assign(new Error("interno"), { digest: "123" });
    const { unmount } = render(<RootError error={error} retry={jest.fn()} />);
    expect(screen.getByRole("main")).toHaveTextContent("Código: 123");
    expect(screen.queryByText("interno")).not.toBeInTheDocument();
    unmount();
    render(<AppError error={error} retry={jest.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Código: 123");
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });
});
