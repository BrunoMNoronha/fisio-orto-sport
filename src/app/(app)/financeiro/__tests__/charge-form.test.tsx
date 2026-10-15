jest.mock("@/modules/financeiro/actions", () => ({ searchChargePatients: jest.fn() }));
jest.mock("@/modules/agenda/actions", () => ({ searchActivePatients: jest.fn() }));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { searchChargePatients } from "@/modules/financeiro/actions";
import { ChargeForm } from "../charge-form";

const empty = { description: "", amount: "", dueDate: "", reason: "" };

describe("ChargeForm", () => {
  it("lança com a chave da operação e o paciente escolhido; normaliza o valor ao sair do campo", async () => {
    const action = jest.fn().mockResolvedValue(undefined);
    render(
      <ChargeForm
        action={action}
        requestId="req-abc-12345"
        initialPatient={{ id: "p1", label: "ANA (inativo)" }}
        initial={empty}
        cancelHref="/financeiro"
        submitLabel="Lançar cobrança"
      />,
    );
    expect(screen.getByText("ANA (inativo)")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Motivo/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Descrição *"), { target: { value: "Pacote outubro" } });
    const amount = screen.getByLabelText("Valor (R$) *");
    fireEvent.change(amount, { target: { value: "1234,5" } });
    fireEvent.blur(amount);
    expect(amount).toHaveValue("1.234,50");
    fireEvent.change(screen.getByLabelText("Vencimento *"), { target: { value: "2026-10-31" } });

    fireEvent.submit(screen.getByRole("button", { name: "Lançar cobrança" }).closest("form")!);
    await waitFor(() => expect(action).toHaveBeenCalled());
    const data = action.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(data.entries())).toEqual({
      requestId: "req-abc-12345",
      patientId: "p1",
      description: "Pacote outubro",
      amount: "1.234,50",
      dueDate: "2026-10-31",
    });
  });

  it("valor inválido fica como digitado e o erro do servidor aparece ligado ao campo", async () => {
    const action = jest.fn().mockResolvedValue({ fieldErrors: { amount: ["Use no máximo dois dígitos para os centavos."] } });
    render(
      <ChargeForm action={action} requestId="req-abc-12345" initialPatient={null} initial={empty} cancelHref="/financeiro" submitLabel="Lançar cobrança" />,
    );
    const amount = screen.getByLabelText("Valor (R$) *");
    fireEvent.change(amount, { target: { value: "10,999" } });
    fireEvent.blur(amount);
    expect(amount).toHaveValue("10,999");
    fireEvent.submit(amount.closest("form")!);
    expect(await screen.findByText("Use no máximo dois dígitos para os centavos.")).toBeInTheDocument();
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(amount.getAttribute("aria-describedby")).toContain("cobranca-amount-erro");
    expect(amount).toHaveValue("10,999");
  });

  it("substituição envia a original e o motivo, com os dados atuais preenchidos", async () => {
    const action = jest.fn().mockResolvedValue({ error: "Esta cobrança já está cancelada. A substituição não foi registrada." });
    render(
      <ChargeForm
        action={action}
        requestId="req-abc-99999"
        chargeId="c1"
        initialPatient={{ id: "p1", label: "ANA" }}
        initial={{ description: "Pacote", amount: "350,00", dueDate: "2026-10-31", reason: "" }}
        cancelHref="/financeiro/c1"
        submitLabel="Cancelar original e lançar substituta"
      />,
    );
    fireEvent.change(screen.getByLabelText("Motivo do cancelamento da original *"), { target: { value: "Valor errado" } });
    fireEvent.submit(screen.getByRole("button", { name: "Cancelar original e lançar substituta" }).closest("form")!);
    await waitFor(() => expect(action).toHaveBeenCalled());
    const data = action.mock.calls[0][1] as FormData;
    expect([data.get("id"), data.get("reason"), data.get("amount"), data.get("requestId")]).toEqual([
      "c1",
      "Valor errado",
      "350,00",
      "req-abc-99999",
    ]);
    expect(await screen.findByText(/já está cancelada/)).toBeInTheDocument();
    expect(searchChargePatients).not.toHaveBeenCalled();
  });
});
