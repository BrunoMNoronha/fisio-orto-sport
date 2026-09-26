import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EMPTY_PLAN, PlanForm } from "../plan-form";

const origins = [
  { id: "av2", label: "Avaliação inicial de 10/09/2026 (mais recente)", diagnosis: "Tendinopatia", therapeuticGoals: "Reduzir dor" },
  { id: "av1", label: "Avaliação inicial de 01/08/2026", diagnosis: "Lombalgia", therapeuticGoals: null },
];

describe("PlanForm — criação", () => {
  function setup(action = jest.fn()) {
    render(
      <PlanForm
        action={action}
        initial={{ ...EMPTY_PLAN, planDate: "2026-09-26" }}
        mode={{ kind: "create", origins, initialAssessmentId: "av2" }}
        cancelHref="/voltar"
        submitLabel="Salvar plano"
      />,
    );
    return action;
  }

  it("mostra diagnóstico e objetivos da avaliação escolhida e copia os objetivos só sob demanda", () => {
    setup();
    expect(screen.getByLabelText("Referência da avaliação")).toHaveTextContent("Tendinopatia");
    const goals = screen.getByLabelText("Objetivos terapêuticos *");
    expect(goals).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Usar estes objetivos no plano" }));
    expect(goals).toHaveValue("Reduzir dor");

    fireEvent.change(screen.getByLabelText("Avaliação de origem *"), { target: { value: "av1" } });
    expect(screen.getByText("Lombalgia")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Usar estes objetivos no plano" })).not.toBeInTheDocument();
    // Trocar a avaliação não apaga o que já foi preenchido.
    expect(goals).toHaveValue("Reduzir dor");
  });

  it("marca obrigatórios, explica que a quantidade é informativa e foca o primeiro erro", async () => {
    const action = setup(
      jest.fn().mockResolvedValue({ fieldErrors: { conduct: ["Informe a conduta."], plannedSessions: ["Número inválido."] } }),
    );
    expect(screen.getByLabelText("Conduta *")).toBeRequired();
    expect(screen.getByLabelText("Técnicas previstas (opcional)")).not.toBeRequired();
    expect(screen.getByLabelText("Quantidade prevista de sessões (opcional)")).toHaveAccessibleDescription(
      /Só informativo: não bloqueia atendimentos/,
    );

    fireEvent.change(screen.getByLabelText("Exercícios previstos (opcional)"), { target: { value: "Ponte" } });
    fireEvent.submit(screen.getByRole("button", { name: "Salvar plano" }).closest("form")!);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const data = action.mock.calls[0][1] as FormData;
    expect([data.get("assessmentId"), data.get("planDate"), data.get("exercises")]).toEqual(["av2", "2026-09-26", "Ponte"]);

    const conduct = screen.getByLabelText("Conduta *");
    await waitFor(() => expect(conduct).toHaveFocus());
    expect(conduct).toHaveAccessibleDescription("Informe a conduta.");
    expect(screen.getByLabelText("Exercícios previstos (opcional)")).toHaveValue("Ponte");
  });
});

describe("PlanForm — revisão", () => {
  it("pede tipo e motivo e envia a revisão-base", async () => {
    const action = jest.fn().mockResolvedValue({ error: "Este plano foi revisado ou mudou de estado enquanto você editava." });
    render(
      <PlanForm
        action={action}
        initial={{ ...EMPTY_PLAN, planDate: "2026-09-10", goals: "Reduzir dor", conduct: "Cinesioterapia" }}
        mode={{ kind: "revise", baseRevision: 3 }}
        cancelHref="/voltar"
        submitLabel="Salvar revisão"
      />,
    );
    expect(screen.queryByLabelText("Avaliação de origem *")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mudança clínica do planejamento"));
    fireEvent.change(screen.getByLabelText("Motivo da revisão *"), { target: { value: "Evolução lenta" } });
    fireEvent.submit(screen.getByRole("button", { name: "Salvar revisão" }).closest("form")!);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const data = action.mock.calls[0][1] as FormData;
    expect([data.get("kind"), data.get("reason"), data.get("baseRevision"), data.get("goals")]).toEqual([
      "MUDANCA_CLINICA",
      "Evolução lenta",
      "3",
      "Reduzir dor",
    ]);
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  });
});
