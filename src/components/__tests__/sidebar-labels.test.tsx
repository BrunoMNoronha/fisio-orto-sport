import { render, screen } from "@testing-library/react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { SidebarProvider, SidebarRail, SidebarTrigger } from "@/components/ui/sidebar";

// Issue #47: nomes acessíveis do menu e da trilha em português (antes "Toggle Sidebar" e "breadcrumb").
describe("rótulos acessíveis da navegação", () => {
  beforeAll(() => {
    // useIsMobile consulta matchMedia, ausente no jsdom.
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  it("botão e trilho do menu", () => {
    render(
      <SidebarProvider>
        <SidebarTrigger />
        <SidebarRail />
      </SidebarProvider>,
    );
    expect(screen.getAllByRole("button", { name: "Mostrar ou ocultar menu" })).toHaveLength(2);
    expect(screen.queryByText(/Toggle Sidebar/)).not.toBeInTheDocument();
  });

  it("trilha de navegação", () => {
    render(<Breadcrumb />);
    expect(screen.getByRole("navigation", { name: "Trilha de navegação" })).toBeInTheDocument();
  });
});
