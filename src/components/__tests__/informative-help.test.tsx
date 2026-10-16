import { fireEvent, render, screen } from "@testing-library/react";
import { ActionHelpProvider, HelpLabel, NativeActionButton } from "../informative-help";
import { Button } from "../ui/button";
import { TooltipProvider } from "../ui/tooltip";

// Hover, touch, Escape and real positioning are validated in the running browser.
function Example({ enabled = false, onAction = jest.fn() }) {
  return <TooltipProvider><ActionHelpProvider enabled={enabled}>
    <form onSubmit={event => { event.preventDefault(); onAction(); }}>
      <HelpLabel htmlFor="test-field" help="Informe o telefone com DDD.">Telefone</HelpLabel>
      <input id="test-field" />
      <Button type="submit" help="Salva os dados informados.">Salvar</Button>
      <NativeActionButton type="button" disabled help="Remove este registro.">Remover</NativeActionButton>
    </form>
  </ActionHelpProvider></TooltipProvider>;
}

it("mantém ajuda da label com ações desligadas e preserva associação ao campo", () => {
  const action = jest.fn();
  render(<Example onAction={action} />);
  expect(screen.getByLabelText("Telefone")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ajuda sobre esta ação" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ajuda sobre este campo" })).toHaveAttribute("type", "button");
  expect(action).not.toHaveBeenCalled();
});

it("mantém ação única, tipos dos botões e ajuda consultável para ação desabilitada", () => {
  const action = jest.fn();
  render(<Example enabled onAction={action} />);
  expect(screen.getAllByRole("button", { name: "Ajuda sobre esta ação" })).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Remover" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  expect(action).toHaveBeenCalledTimes(1);
});

it("aplica mudança da preferência sem remontar o botão", () => {
  const { rerender } = render(<Example enabled />);
  const save = screen.getByRole("button", { name: "Salvar" });
  rerender(<Example enabled={false} />);
  expect(screen.getByRole("button", { name: "Salvar" })).toBe(save);
  expect(screen.queryByRole("button", { name: "Ajuda sobre esta ação" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ajuda sobre este campo" })).toBeInTheDocument();
});
