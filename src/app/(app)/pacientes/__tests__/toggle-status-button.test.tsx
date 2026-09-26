import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToggleStatusButton } from "../toggle-status-button";

const setPatientStatus = jest.fn();
jest.mock("@/modules/pacientes/actions", () => ({
  setPatientStatus: (...args: unknown[]) => setPatientStatus(...args),
}));

beforeEach(() => {
  setPatientStatus.mockReset().mockResolvedValue({ ok: true, message: "ok" });
});

describe("ToggleStatusButton", () => {
  it("inativar pede confirmação antes de chamar a action", async () => {
    render(<ToggleStatusButton id="p1" status="ATIVO" patientName="Carla Dias" />);
    fireEvent.click(screen.getByRole("button", { name: "Inativar" }));
    expect(setPatientStatus).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog", { name: "Inativar paciente?" });
    expect(dialog).toHaveTextContent("Carla Dias");
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(setPatientStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Inativar" }));
    const confirm = await screen.findByRole("dialog");
    fireEvent.submit(confirm.querySelector("form")!);
    await waitFor(() => expect(setPatientStatus).toHaveBeenCalledTimes(1));
    const formData = setPatientStatus.mock.calls[0][1] as FormData;
    expect([formData.get("id"), formData.get("status")]).toEqual(["p1", "INATIVO"]);
  });

  it("reativar continua direto (sem diálogo)", async () => {
    render(<ToggleStatusButton id="p1" status="INATIVO" patientName="Carla Dias" />);
    fireEvent.click(screen.getByRole("button", { name: "Reativar" }));
    await waitFor(() => expect(setPatientStatus).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
