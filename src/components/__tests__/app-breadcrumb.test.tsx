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
});
