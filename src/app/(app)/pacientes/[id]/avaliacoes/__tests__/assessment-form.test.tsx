import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssessmentForm, EMPTY_ASSESSMENT } from "../assessment-form";

const options = [
  { id: "an2", label: "Anamnese de 10/09/2026 (vigente)" },
  { id: "an1", label: "Anamnese de 01/08/2026" },
];

function setup(action = jest.fn(), extra: Partial<React.ComponentProps<typeof AssessmentForm>> = {}) {
  render(
    <AssessmentForm
      action={action}
      initial={{ ...EMPTY_ASSESSMENT, assessmentDate: "2026-09-26" }}
      anamnesisOptions={options}
      initialAnamnesisId="an2"
      cancelHref="/voltar"
      submitLabel="Salvar avaliação"
      {...extra}
    />,
  );
  return action;
}

describe("AssessmentForm", () => {
  it("tem rótulos para todos os campos e marca os obrigatórios", () => {
    setup();
    expect(screen.getByLabelText("Data da avaliação *")).toHaveValue("2026-09-26");
    expect(screen.getByLabelText("Anamnese de referência *")).toHaveValue("an2");
    expect(screen.getByLabelText("Diagnóstico fisioterapêutico *")).toBeRequired();
    for (const label of [
      "Inspeção e postura (opcional)",
      "Palpação (opcional)",
      "Avaliação funcional e marcha (opcional)",
      "Amplitude de movimento (ADM) (opcional)",
      "Força muscular (opcional)",
      "Testes especiais (opcional)",
      "Objetivos terapêuticos (opcional)",
      "Observações clínicas (opcional)",
    ]) {
      expect(screen.getByLabelText(label)).not.toBeRequired();
    }
    // Dica de contexto da ADM ligada ao campo.
    expect(screen.getByLabelText("Amplitude de movimento (ADM) (opcional)")).toHaveAccessibleDescription(
      /Segmento, lado, movimento/,
    );
  });

  it("envia os campos, preserva o preenchimento após erro e foca o primeiro campo inválido", async () => {
    const action = jest.fn().mockResolvedValue({
      fieldErrors: { diagnosis: ["Informe o diagnóstico fisioterapêutico."], clinicalNotes: ["Longo demais."] },
    });
    setup(action);
    fireEvent.change(screen.getByLabelText("Palpação (opcional)"), { target: { value: "Dor à palpação" } });
    fireEvent.submit(screen.getByRole("button", { name: "Salvar avaliação" }).closest("form")!);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const formData = action.mock.calls[0][1] as FormData;
    expect([formData.get("anamnesisId"), formData.get("palpation"), formData.get("assessmentDate")]).toEqual([
      "an2",
      "Dor à palpação",
      "2026-09-26",
    ]);

    const diagnosis = await screen.findByLabelText("Diagnóstico fisioterapêutico *");
    await waitFor(() => expect(diagnosis).toHaveFocus());
    expect(diagnosis).toHaveAttribute("aria-invalid", "true");
    expect(diagnosis).toHaveAccessibleDescription("Informe o diagnóstico fisioterapêutico.");
    expect(screen.getByLabelText("Palpação (opcional)")).toHaveValue("Dor à palpação");
  });

  it("erro geral (ex.: conflito de edição) aparece e recebe o foco", async () => {
    const action = jest.fn().mockResolvedValue({ error: "Esta avaliação foi alterada por outra pessoa." });
    setup(action, { anamnesisOptions: undefined, version: 3 });
    expect(screen.queryByLabelText("Anamnese de referência *")).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole("button", { name: "Salvar avaliação" }).closest("form")!);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("alterada por outra pessoa");
    await waitFor(() => expect(alert).toHaveFocus());
    expect((action.mock.calls[0][1] as FormData).get("version")).toBe("3");
  });
});
