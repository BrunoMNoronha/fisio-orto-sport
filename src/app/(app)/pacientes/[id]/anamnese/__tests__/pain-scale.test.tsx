import { render, screen } from "@testing-library/react";
import { PainScale } from "../pain-scale";

describe("PainScale", () => {
  it("todos os rádios têm nome acessível, inclusive \"Não informado\"", () => {
    render(<PainScale id="dor" value="" onChange={jest.fn()} />);
    const radios = screen.getAllByRole("radio", { hidden: true });
    expect(radios).toHaveLength(12);
    for (const radio of radios) expect(radio).toHaveAccessibleName();
    expect(screen.getByRole("radio", { name: "Não informado", hidden: true })).toBeChecked();
  });
});
