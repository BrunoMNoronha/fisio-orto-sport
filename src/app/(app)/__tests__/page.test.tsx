import { render, screen } from "@testing-library/react";
import Home from "../page";

jest.mock("@/modules/auth/dal", () => ({
  requireUser: jest.fn().mockResolvedValue({
    id: "u1",
    name: "Ana",
    email: "ana@example.com",
    role: "ADMIN",
  }),
}));

describe("Home", () => {
  it("exibe o nome do produto e saúda o usuário", async () => {
    render(await Home());
    expect(
      screen.getByRole("heading", { level: 1, name: "Fisio OrtoSport" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Olá, Ana\./)).toBeInTheDocument();
  });

  it("lista os módulos do MVP", async () => {
    render(await Home());
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });
});
