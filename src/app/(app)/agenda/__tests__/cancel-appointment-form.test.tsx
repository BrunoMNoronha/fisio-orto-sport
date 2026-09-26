import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CancelAppointmentForm } from "../cancel-appointment-form";

const cancelAppointment = jest.fn();
jest.mock("@/modules/agenda/actions", () => ({
  cancelAppointment: (...args: unknown[]) => cancelAppointment(...args),
}));

beforeEach(() => {
  cancelAppointment.mockReset().mockResolvedValue({ ok: true, message: "Agendamento cancelado." });
});

describe("CancelAppointmentForm", () => {
  it("só cancela depois de confirmar no diálogo, enviando o motivo", async () => {
    render(<CancelAppointmentForm id="a1" />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar agendamento" }));
    expect(cancelAppointment).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog", { name: "Cancelar este agendamento?" });
    expect(dialog).toHaveTextContent("não pode ser desfeito");
    fireEvent.change(screen.getByLabelText("Motivo do cancelamento (opcional)"), { target: { value: "Paciente pediu" } });
    fireEvent.submit(dialog.querySelector("form")!);

    await waitFor(() => expect(cancelAppointment).toHaveBeenCalledTimes(1));
    const formData = cancelAppointment.mock.calls[0][1] as FormData;
    expect([formData.get("id"), formData.get("reason")]).toEqual(["a1", "Paciente pediu"]);
  });
});
