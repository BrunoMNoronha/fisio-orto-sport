jest.mock("@/modules/financeiro/payment-actions", () => ({ reversePaymentAction: jest.fn() }));

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { reversePaymentAction, type PaymentActionState } from "@/modules/financeiro/payment-actions";
import { PaymentForm } from "../payment-form";
import { ReversePaymentForm } from "../[id]/reverse-payment-form";

const initial = { amount: "", receivedOn: "2026-10-05", reversedOn: "", reason: "" };
const common = { requestId: "req-12345678", chargeId: "c1", initial, today: "2026-10-05", cancelHref: "/financeiro/c1" };

describe("PaymentForm", () => {
  it("normaliza centavos e envia apenas o vínculo explícito e a chave estável", async () => {
    const action = jest.fn().mockResolvedValue(undefined);
    const { rerender } = render(<PaymentForm {...common} action={action} replacesPaymentId="pOriginal" />);
    const amount = screen.getByLabelText("Valor recebido (R$) *");
    fireEvent.change(amount, { target: { value: "30,1" } });
    fireEvent.blur(amount);
    expect(amount).toHaveValue("30,10");
    const date = screen.getByLabelText("Data do recebimento *");
    expect(date).toHaveAttribute("min", "2000-01-01");
    expect(date).toHaveAttribute("max", "2026-10-05");
    fireEvent.change(date, { target: { value: "2000-01-01" } });
    // Revalidação do servidor não troca a identidade da operação de um formulário montado.
    rerender(<PaymentForm {...common} requestId="req-outra-chave" action={action} replacesPaymentId="pOriginal" />);
    fireEvent.submit(screen.getByRole("button", { name: "Registrar recebimento" }).closest("form")!);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries((action.mock.calls[0][1] as FormData).entries())).toEqual({
      requestId: "req-12345678", chargeId: "c1", replacesPaymentId: "pOriginal", amount: "30,10", receivedOn: "2000-01-01",
    });
    expect(screen.queryByLabelText("Motivo da correção *")).not.toBeInTheDocument();
  });
  it("mantém valor inválido e campos após erro, anunciando erro acessível", async () => {
    const action = jest.fn().mockResolvedValue({ fieldErrors: { amount: ["Use no máximo dois dígitos para os centavos."] } });
    render(<PaymentForm {...common} action={action} />);
    const amount = screen.getByLabelText("Valor recebido (R$) *");
    fireEvent.change(amount, { target: { value: "10,999" } });
    fireEvent.blur(amount);
    fireEvent.submit(amount.closest("form")!);
    expect(await screen.findByText("Use no máximo dois dígitos para os centavos.")).toBeInTheDocument();
    expect(amount).toHaveValue("10,999");
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(amount.getAttribute("aria-describedby")).toContain("pagamento-amount-erro");
    expect(screen.getByLabelText("Data do recebimento *")).toHaveValue("2026-10-05");
  });
  it("correção permite recebimento anterior ao estorno e mantém motivo após falha", async () => {
    const action = jest.fn().mockResolvedValue({ error: "O valor supera o saldo disponível." });
    render(<PaymentForm {...common} action={action} paymentId="p1" originalReceivedOn="2026-09-01"
      initial={{ amount: "70,00", receivedOn: "2026-09-01", reversedOn: "2026-10-05", reason: "" }} />);
    expect(screen.getByLabelText("Data do estorno da original *")).toHaveAttribute("min", "2026-09-01");
    expect(screen.getByLabelText("Data do recebimento *")).toHaveAttribute("min", "2000-01-01");
    fireEvent.change(screen.getByLabelText("Data do recebimento *"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Motivo da correção *"), { target: { value: "Corrigir data e valor" } });
    fireEvent.submit(screen.getByRole("button", { name: "Estornar original e registrar substituto" }).closest("form")!);
    await screen.findByRole("alert");
    expect(Object.fromEntries((action.mock.calls[0][1] as FormData).entries())).toEqual({
      requestId: "req-12345678", paymentId: "p1", amount: "70,00", receivedOn: "2026-08-01", reversedOn: "2026-10-05", reason: "Corrigir data e valor",
    });
    expect(screen.getByLabelText("Motivo da correção *")).toHaveValue("Corrigir data e valor");
  });
  it("desabilita envio e bloqueia edição enquanto aguarda", async () => {
    let resolve!: (state: PaymentActionState) => void;
    const action = jest.fn(() => new Promise<PaymentActionState>((done) => { resolve = done; }));
    render(<PaymentForm {...common} action={action} />);
    fireEvent.submit(screen.getByRole("button", { name: "Registrar recebimento" }).closest("form")!);
    expect(await screen.findByRole("button", { name: "Salvando…" })).toBeDisabled();
    expect(screen.getByLabelText("Valor recebido (R$) *")).toHaveAttribute("readonly");
    await act(async () => resolve({ error: "Saldo mudou. Confira os valores." }));
    expect(screen.getByRole("button", { name: "Registrar recebimento" })).toBeEnabled();
  });
});

describe("diálogo de estorno", () => {
  it("mantém datas/motivo e liga erros aos campos; envia chave gerada na página", async () => {
    (reversePaymentAction as jest.Mock).mockResolvedValue({ fieldErrors: { reversedOn: ["A data do estorno não pode ser anterior ao recebimento original."] } });
    render(<ReversePaymentForm paymentId="p1" requestId="req-abcdef123" receivedOn="2026-09-01" today="2026-10-05" />);
    fireEvent.click(screen.getByRole("button", { name: "Estornar" }));
    const date = await screen.findByLabelText("Data do estorno *");
    expect(date).toHaveValue("2026-10-05");
    expect(date).toHaveAttribute("min", "2026-09-01");
    fireEvent.change(date, { target: { value: "2026-08-31" } });
    fireEvent.change(screen.getByLabelText("Motivo do estorno *"), { target: { value: "Lançamento em duplicidade" } });
    fireEvent.submit(screen.getByRole("button", { name: "Confirmar estorno" }).closest("form")!);
    expect(await screen.findByText("A data do estorno não pode ser anterior ao recebimento original.")).toBeInTheDocument();
    expect(date).toHaveValue("2026-08-31");
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(date.getAttribute("aria-describedby")).toBe("estorno-p1-reversedOn-erro");
    expect(screen.getByLabelText("Motivo do estorno *")).toHaveValue("Lançamento em duplicidade");
    expect(Object.fromEntries(((reversePaymentAction as jest.Mock).mock.calls[0][1] as FormData).entries())).toEqual({
      paymentId: "p1", requestId: "req-abcdef123", reversedOn: "2026-08-31", reason: "Lançamento em duplicidade",
    });
  });
});
