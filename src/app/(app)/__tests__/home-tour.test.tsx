import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("@/modules/onboarding/actions", () => ({
  markFinanceTourSeenAction: jest.fn(async () => ({ ok: true })),
}));

import { markFinanceTourSeenAction } from "@/modules/onboarding/actions";
import { HomeTour, TOUR_STEPS } from "../home-tour";

beforeEach(() => jest.clearAllMocks());

describe("HomeTour", () => {
  it("abre acessível no primeiro passo, com título, descrição e contador", async () => {
    render(<HomeTour />);
    const dialog = await screen.findByRole("dialog", { name: TOUR_STEPS[0].title });
    expect(dialog).toHaveAccessibleDescription(TOUR_STEPS[0].description);
    expect(screen.getByText("Passo 1 de 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pular" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próximo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Concluir" })).not.toBeInTheDocument();
  });

  it("avança até o último passo, onde só resta Concluir, e grava ao concluir", async () => {
    render(<HomeTour />);
    await screen.findByRole("dialog");
    for (let index = 1; index < TOUR_STEPS.length; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
      expect(screen.getByRole("heading", { name: TOUR_STEPS[index].title })).toBeInTheDocument();
    }
    expect(screen.getByText(`Passo ${TOUR_STEPS.length} de ${TOUR_STEPS.length}`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pular" })).not.toBeInTheDocument();
    expect(markFinanceTourSeenAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    await waitFor(() => expect(markFinanceTourSeenAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Pular grava como visto e fecha", async () => {
    render(<HomeTour />);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Pular" }));
    await waitFor(() => expect(markFinanceTourSeenAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Esc vale como Pular", async () => {
    render(<HomeTour />);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(markFinanceTourSeenAction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
