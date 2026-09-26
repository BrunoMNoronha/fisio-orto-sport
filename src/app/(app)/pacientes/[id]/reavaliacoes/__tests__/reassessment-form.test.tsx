import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EMPTY_REASSESSMENT, ReassessmentForm } from "../reassessment-form";

const plans = [
  {
    id: "pl1",
    label: "Plano da avaliação de 01/09/2026",
    goalsLabel: "Objetivos da revisão 2",
    goals: "Recuperar ADM",
    sessionsLabel: "3 sessões válidas neste plano. Mais recentes:",
    recentSessions: [{ id: "s1", label: "15/09/2026 09:00 · Bruna", evolution: "Dor 5/10" }],
  },
  { id: "pl2", label: "Plano 2", goalsLabel: "Objetivos da revisão 1", goals: "Marcha", sessionsLabel: "Nenhuma sessão.", recentSessions: [] },
];

describe("ReassessmentForm", () => {
  it("mostra o contexto do plano escolhido (objetivos e sessões recentes) e troca ao mudar de plano", () => {
    render(
      <ReassessmentForm
        action={jest.fn()}
        initial={{ ...EMPTY_REASSESSMENT, reassessmentDate: "2026-09-20" }}
        mode={{ kind: "create", plans, initialPlanId: "pl1" }}
        cancelHref="/voltar"
        submitLabel="Salvar reavaliação"
      />,
    );
    const context = screen.getByLabelText("Contexto do plano");
    expect(context).toHaveTextContent("Recuperar ADM");
    expect(context).toHaveTextContent("Dor 5/10");
    fireEvent.change(screen.getByLabelText("Plano terapêutico *"), { target: { value: "pl2" } });
    expect(screen.getByLabelText("Contexto do plano")).toHaveTextContent("Marcha");
    // Aviso de que a indicação de alta só documenta.
    expect(screen.getByText(/Indicar alta só documenta/)).toBeInTheDocument();
  });

  it("envia opções e textos, preserva após erro e foca o primeiro grupo inválido", async () => {
    const action = jest.fn().mockResolvedValue({ fieldErrors: { goalsStatus: ["Selecione a situação dos objetivos."] } });
    render(
      <ReassessmentForm
        action={action}
        initial={{ ...EMPTY_REASSESSMENT, reassessmentDate: "2026-09-20" }}
        mode={{ kind: "create", plans, initialPlanId: "pl1" }}
        cancelHref="/voltar"
        submitLabel="Salvar reavaliação"
      />,
    );
    fireEvent.change(screen.getByLabelText("Evolução em relação à referência *"), { target: { value: "Melhora" } });
    fireEvent.click(screen.getByLabelText("Indicação de alta"));
    fireEvent.submit(screen.getByRole("button", { name: "Salvar reavaliação" }).closest("form")!);
    await waitFor(() => expect(action).toHaveBeenCalled());
    const data = action.mock.calls[0][1] as FormData;
    expect([data.get("planId"), data.get("conclusion"), data.get("progressSummary")]).toEqual(["pl1", "INDICACAO_ALTA", "Melhora"]);
    await waitFor(() => expect(screen.getByLabelText("Atingidos")).toHaveFocus());
    expect(screen.getByText("Selecione a situação dos objetivos.")).toBeInTheDocument();
    expect(screen.getByLabelText("Evolução em relação à referência *")).toHaveValue("Melhora");
  });

  it("correção pede motivo e envia a versão", async () => {
    const action = jest.fn().mockResolvedValue(undefined);
    render(
      <ReassessmentForm
        action={action}
        initial={{ ...EMPTY_REASSESSMENT, reassessmentDate: "2026-09-20", conclusion: "CONTINUIDADE" }}
        mode={{ kind: "edit", version: 2 }}
        cancelHref="/voltar"
        submitLabel="Salvar correção"
      />,
    );
    expect(screen.queryByLabelText("Plano terapêutico *")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motivo da correção *"), { target: { value: "Digitação" } });
    fireEvent.submit(screen.getByRole("button", { name: "Salvar correção" }).closest("form")!);
    await waitFor(() => expect(action).toHaveBeenCalled());
    const data = action.mock.calls[0][1] as FormData;
    expect([data.get("version"), data.get("reason"), data.get("conclusion")]).toEqual(["2", "Digitação", "CONTINUIDADE"]);
  });
});
