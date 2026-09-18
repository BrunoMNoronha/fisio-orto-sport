import { render, screen } from "@testing-library/react";
import Home from "../page";

describe("Home", () => {
  it("exibe o nome do produto", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Fisio OrtoSport" }),
    ).toBeInTheDocument();
  });

  it("lista os módulos do MVP", () => {
    render(<Home />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });
});
