import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/modules/agenda/actions", () => ({
  searchActivePatients: jest.fn(async () => ({
    items: [{ id: "p777", label: "Paciente Fictício 777" }],
    hasMore: false,
  })),
}));

import { AppointmentForm, type AppointmentFormValues } from "../appointment-form";

function setup(date: string, startTime: string) {
  const initial: AppointmentFormValues = { patientId: "", professionalId: "", date, startTime, endTime: "", notes: "" };
  render(
    <AppointmentForm
      action={jest.fn()}
      initial={initial}
      professionals={[]}
      patientPicker={{ initial: null }}
      cancelHref="/agenda"
      submitLabel="Agendar"
    />,
  );
}

describe("AppointmentForm — início no passado", () => {
  it("avisa, sem bloquear, quando o início já passou", () => {
    setup("2020-01-10", "09:00");
    expect(screen.getByRole("alert")).toHaveTextContent("O início escolhido já passou");
    expect(screen.getByRole("button", { name: "Agendar" })).toBeEnabled();
  });

  it("não avisa para horário futuro", () => {
    setup("2099-01-10", "09:00");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AppointmentForm — paciente", () => {
  const empty: AppointmentFormValues = {
    patientId: "",
    professionalId: "",
    date: "2099-01-10",
    startTime: "",
    endTime: "",
    notes: "",
  };

  it("mantém o paciente escolhido depois de um erro de validação", async () => {
    const action = jest.fn(async (_prev: unknown, formData: FormData) => ({
      fieldErrors: { startTime: [`Informe o início (paciente ${formData.get("patientId")}).`] },
    }));
    render(
      <AppointmentForm
        action={action}
        initial={empty}
        professionals={[]}
        patientPicker={{ initial: null }}
        cancelHref="/agenda"
        submitLabel="Agendar"
      />,
    );
    const input = screen.getByRole("combobox", { name: /Paciente/ });
    fireEvent.change(input, { target: { value: "777" } });
    fireEvent.click(await screen.findByRole("option", { name: "Paciente Fictício 777" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Agendar" }));
    });
    expect(await screen.findByText("Informe o início (paciente p777).")).toBeInTheDocument();
    expect(screen.getByText("Paciente Fictício 777")).toBeInTheDocument();
    const form = input.closest("form") as HTMLFormElement;
    expect((form.elements.namedItem("patientId") as HTMLInputElement).value).toBe("p777");
  });

  it("pré-seleciona o paciente vindo da ficha", () => {
    render(
      <AppointmentForm
        action={jest.fn()}
        initial={{ ...empty, patientId: "p1" }}
        professionals={[]}
        patientPicker={{ initial: { id: "p1", label: "Ana Souza" } }}
        cancelHref="/agenda"
        submitLabel="Agendar"
      />,
    );
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
  });
});

describe("AppointmentForm — duração sugerida (issue #63)", () => {
  const blank: AppointmentFormValues = {
    patientId: "",
    professionalId: "",
    date: "2099-01-10",
    startTime: "",
    endTime: "",
    notes: "",
  };

  function renderWith(duration: number | null, initial = blank) {
    render(
      <AppointmentForm
        action={jest.fn()}
        initial={initial}
        professionals={[]}
        patientPicker={{ initial: null }}
        suggestedDurationMinutes={duration}
        cancelHref="/agenda"
        submitLabel="Agendar"
      />,
    );
    return { start: screen.getByLabelText("Início *"), end: screen.getByLabelText("Fim *") };
  }

  it("sugere o fim a partir do início e acompanha a mudança do início", () => {
    const { start, end } = renderWith(50);
    fireEvent.change(start, { target: { value: "09:00" } });
    expect(end).toHaveValue("09:50");
    fireEvent.change(start, { target: { value: "10:15" } });
    expect(end).toHaveValue("11:05");
    expect(screen.getByText(/sugerido com 50 minutos/)).toBeInTheDocument();
  });

  it("não sobrescreve um fim editado à mão", () => {
    const { start, end } = renderWith(50);
    fireEvent.change(start, { target: { value: "09:00" } });
    fireEvent.change(end, { target: { value: "09:30" } });
    fireEvent.change(start, { target: { value: "08:00" } });
    expect(end).toHaveValue("09:30");
  });

  it("desligada, não preenche nada (comportamento anterior)", () => {
    const { start, end } = renderWith(null);
    fireEvent.change(start, { target: { value: "09:00" } });
    expect(end).toHaveValue("");
    expect(screen.queryByText(/sugerido com/)).not.toBeInTheDocument();
  });
});
