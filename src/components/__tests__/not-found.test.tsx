import { render, screen } from "@testing-library/react";
import AppNotFound from "@/app/(app)/not-found";
import RootNotFound from "@/app/not-found";

// Issue #47: registro ou endereço inexistente mostra 404 em português, com caminho de volta. Os
// atalhos são <a> com role="button" (padrão do Button com render={<Link />} no projeto).
describe("páginas 404", () => {
  it("área autenticada: título, explicação e atalhos de volta", () => {
    render(<AppNotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ir para pacientes" })).toHaveAttribute("href", "/pacientes");
    expect(screen.getByRole("button", { name: "Voltar ao início" })).toHaveAttribute("href", "/");
    expect(screen.queryByText(/could not be found/i)).not.toBeInTheDocument();
  });

  it("raiz: página própria com landmark main", () => {
    render(<RootNotFound />);
    expect(screen.getByRole("main")).toHaveTextContent("Erro 404");
    expect(screen.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeInTheDocument();
  });
});
