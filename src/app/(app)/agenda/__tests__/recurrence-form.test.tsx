import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
jest.mock("@/modules/agenda/actions", () => ({ searchActivePatients: jest.fn() }));
import { AppointmentForm } from "../appointment-form";

const initial = { patientId: "p1", professionalId: "f1", date: "2026-10-19", startTime: "14:00", endTime: "15:00", notes: "" };
function setup(action = jest.fn(), reschedule = false, maxRecurringSessions = 10) {
  render(<AppointmentForm action={action} initial={initial} professionals={[{ id: "f1", label: "Fisio" }]}
    patientPicker={reschedule ? undefined : { initial: { id: "p1", label: "Paciente" } }}
    appointmentId={reschedule ? "a1" : undefined} maxRecurringSessions={maxRecurringSessions} cancelHref="/agenda" submitLabel="Agendar" />);
}
async function enable() {
  fireEvent.click(screen.getByRole("checkbox", { name: "Agendamento recorrente" }));
  return screen.findByRole("dialog");
}

it("desmarcado mantém quantidade desabilitada e não oferece recorrência no reagendamento", () => {
  const { unmount } = render(<AppointmentForm action={jest.fn()} initial={initial} professionals={[]} appointmentId="a1" cancelHref="/agenda" submitLabel="Reagendar" />);
  expect(screen.queryByText("Agendamento recorrente")).not.toBeInTheDocument(); unmount();
  setup(); expect(screen.getByLabelText("Quantidade de sessões")).toBeDisabled();
});

it("modal confirma Seg/Qua/Sex e mostra exatamente as cinco datas antes de salvar", async () => {
  const action = jest.fn<Promise<{ fieldErrors: { notes: string[] } }>, [unknown, FormData]>()
    .mockResolvedValue({ fieldErrors: { notes: ["Erro de teste"] } }); setup(action);
  const dialog = await enable();
  expect(within(dialog).getByRole("checkbox", { name: "Seg" })).toBeChecked();
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Qua" }));
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Sex" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar dias" }));
  fireEvent.change(screen.getByLabelText("Quantidade de sessões"), { target: { value: "5" } });
  expect(within(screen.getByRole("list", { name: "Datas previstas" })).getAllByRole("listitem").map((item) => item.textContent))
    .toEqual(["19/10/2026 — 14:00–15:00", "21/10/2026 — 14:00–15:00", "23/10/2026 — 14:00–15:00", "26/10/2026 — 14:00–15:00", "28/10/2026 — 14:00–15:00"]);
  expect(action).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Agendar" })); });
  expect(screen.getByLabelText("Quantidade de sessões")).toHaveValue(5);
  const data = action.mock.calls[0][1] as FormData;
  expect(data.getAll("weekdays")).toEqual(["1", "3", "5"]);
  expect(data.get("requestKey")).toMatch(/^[\da-f-]{36}$/);
});

it("cancelar primeira abertura desmarca recorrência; cancelar edição preserva os dias", async () => {
  setup(); let dialog = await enable();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(screen.getByRole("checkbox", { name: "Agendamento recorrente" })).not.toBeChecked();
  dialog = await enable(); fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar dias" }));
  fireEvent.click(screen.getByRole("button", { name: "Alterar dias" }));
  dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Qua" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(screen.getByText("Dias: Seg")).toBeInTheDocument();
});

it("exige dia inicial e avisa após mudar data; usa o limite configurado", async () => {
  setup(jest.fn(), false, 4); const dialog = await enable();
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Seg" }));
  expect(within(dialog).getByRole("button", { name: "Confirmar dias" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Seg" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar dias" }));
  fireEvent.change(screen.getByLabelText("Quantidade de sessões"), { target: { value: "5" } });
  expect(screen.getByText("Máximo de 4 sessões por lote.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Data *"), { target: { value: "2026-10-20" } });
  expect(screen.getByText("Inclua o dia da nova data inicial em Alterar dias.")).toBeInTheDocument();
});

it("Escape cancela e devolve foco ao checkbox", async () => {
  setup(); const checkbox = screen.getByRole("checkbox", { name: "Agendamento recorrente" });
  checkbox.focus(); const dialog = await enable();
  await waitFor(() => expect(within(dialog).getByRole("checkbox", { name: "Seg" })).toHaveFocus());
  fireEvent.keyDown(document.activeElement!, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(checkbox).not.toBeChecked());
  await waitFor(() => expect(checkbox).toHaveFocus());
});
