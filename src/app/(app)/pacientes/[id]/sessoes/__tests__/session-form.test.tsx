import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EMPTY_SESSION, SessionForm } from "../session-form";

const plans = [
  {
    id: "pl1",
    label: "Plano de 01/09/2026 (revisão vigente 2)",
    currentRevisionId: "r2",
    validSessions: 10,
    plannedSessions: 10,
    revisions: [
      { id: "r2", label: "Revisão 2 (vigente)" },
      { id: "r1", label: "Revisão 1" },
    ],
  },
  { id: "pl2", label: "Plano de 05/09/2026", currentRevisionId: "r9", validSessions: 0, plannedSessions: null, revisions: [{ id: "r9", label: "Revisão 1 (vigente)" }] },
];
const professionals = [
  { id: "f1", label: "Bruna (CREFITO 1-F)" },
  { id: "f2", label: "Carlos — inativo" },
];

describe("SessionForm — registro", () => {
  function setup(action = jest.fn(), fixed?: { id: string; label: string }) {
    render(
      <SessionForm
        action={action}
        initial={{ ...EMPTY_SESSION, occurredDate: "2026-09-20", occurredTime: "14:30", professionalId: fixed?.id ?? "" }}
        mode={{ kind: "create", requestId: "req-abc-12345", plans, initialPlanId: "pl1" }}
        professionals={professionals}
        fixedProfessional={fixed}
        cancelHref="/voltar"
        submitLabel="Salvar sessão"
      />,
    );
    return action;
  }

  it("sugere a revisão vigente, troca ao mudar de plano e informa a previsão sem bloquear", () => {
    setup();
    expect(screen.getByLabelText("Revisão do plano aplicada *")).toHaveValue("r2");
    expect(screen.getByText(/10 de 10 previstos/)).toHaveTextContent("só informativo e não impede o registro");
    fireEvent.change(screen.getByLabelText("Plano terapêutico *"), { target: { value: "pl2" } });
    expect(screen.getByLabelText("Revisão do plano aplicada *")).toHaveValue("r9");
    expect(screen.getByText(/Atendimentos válidos neste plano: 0\./)).toBeInTheDocument();
  });

  it("Fisioterapeuta vê o próprio nome fixo como responsável (sem seletor)", async () => {
    const action = setup(jest.fn().mockResolvedValue(undefined), { id: "f1", label: "Bruna (CREFITO 1-F)" });
    expect(screen.getByLabelText("Profissional responsável *")).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText("Evolução clínica *"), { target: { value: "Melhora" } });
    fireEvent.submit(screen.getByRole("button", { name: "Salvar sessão" }).closest("form")!);
    await waitFor(() => expect(action).toHaveBeenCalled());
    const data = action.mock.calls[0][1] as FormData;
    expect([data.get("professionalId"), data.get("requestId"), data.get("planRevisionId")]).toEqual(["f1", "req-abc-12345", "r2"]);
  });

  it("ADMIN escolhe entre fisioterapeutas (inativos marcados); erro foca o campo e preserva o texto", async () => {
    const action = setup(jest.fn().mockResolvedValue({ fieldErrors: { evolution: ["Informe a evolução clínica."] } }));
    expect(screen.getByRole("option", { name: "Carlos — inativo" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Técnicas realizadas (opcional)"), { target: { value: "Liberação" } });
    fireEvent.submit(screen.getByRole("button", { name: "Salvar sessão" }).closest("form")!);
    await waitFor(() => expect(action).toHaveBeenCalled());
    const evolution = screen.getByLabelText("Evolução clínica *");
    await waitFor(() => expect(evolution).toHaveFocus());
    expect(evolution).toHaveAccessibleDescription(/Informe a evolução clínica\./);
    expect(screen.getByLabelText("Técnicas realizadas (opcional)")).toHaveValue("Liberação");
  });
});

describe("SessionForm — correção", () => {
  it("pede motivo e envia a versão; não mostra plano", async () => {
    const action = jest.fn().mockResolvedValue(undefined);
    render(
      <SessionForm
        action={action}
        initial={{ ...EMPTY_SESSION, occurredDate: "2026-09-20", occurredTime: "14:30", professionalId: "f1", evolution: "Melhora" }}
        mode={{ kind: "edit", version: 4 }}
        professionals={professionals}
        cancelHref="/voltar"
        submitLabel="Salvar correção"
      />,
    );
    expect(screen.queryByLabelText("Plano terapêutico *")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motivo da correção *"), { target: { value: "Hora errada" } });
    fireEvent.submit(screen.getByRole("button", { name: "Salvar correção" }).closest("form")!);
    await waitFor(() => expect(action).toHaveBeenCalled());
    const data = action.mock.calls[0][1] as FormData;
    expect([data.get("version"), data.get("reason"), data.get("requestId")]).toEqual(["4", "Hora errada", null]);
  });
});
