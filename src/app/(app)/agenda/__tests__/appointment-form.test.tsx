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

describe("AppointmentForm — conflito do paciente (MEL-02)", () => {
  const values: AppointmentFormValues = {
    patientId: "p1",
    professionalId: "f1",
    date: "2099-01-10",
    startTime: "09:00",
    endTime: "10:00",
    notes: "",
  };

  function renderWith(action: jest.Mock) {
    render(
      <AppointmentForm
        action={action}
        initial={values}
        professionals={[{ id: "f1", label: "Dra. Ana" }]}
        patientName="Paciente Fictício"
        appointmentId="a1"
        cancelHref="/agenda"
        submitLabel="Reagendar"
      />,
    );
  }

  it("mostra o aviso e confirma reenviando com confirmPatientConflict=1", async () => {
    const sent: (string | null)[] = [];
    const action = jest.fn(async (_prev: unknown, formData: FormData) => {
      sent.push(formData.get("confirmPatientConflict") as string | null);
      return { error: "aviso", patientConflicts: [{ id: "a7", label: "10/01/2099 09:00–10:00 com Dr. Beto" }] };
    });
    renderWith(action);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reagendar" }));
    });
    expect(await screen.findByText("10/01/2099 09:00–10:00 com Dr. Beto")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar mesmo assim" }));
    });
    expect(sent).toEqual([null, "1"]);
  });

  it("editar um campo esconde o aviso e volta ao envio normal", async () => {
    const action = jest.fn(async () => ({
      error: "aviso",
      patientConflicts: [{ id: "a7", label: "10/01/2099 09:00–10:00 com Dr. Beto" }],
    }));
    renderWith(action);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reagendar" }));
    });
    expect(await screen.findByRole("button", { name: "Confirmar mesmo assim" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Início *"), { target: { value: "11:00" } });
    expect(screen.queryByRole("button", { name: "Confirmar mesmo assim" })).not.toBeInTheDocument();
    expect(screen.queryByText("10/01/2099 09:00–10:00 com Dr. Beto")).not.toBeInTheDocument();
    expect(screen.queryByText("aviso")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reagendar" })).toBeInTheDocument();
  });
});

// Expediente (#78): segunda 08:00–12:00 e 13:00–18:00; domingo fechado. 2099-01-12 é segunda-feira.
describe("AppointmentForm — expediente", () => {
  const HOURS = ";08:00-12:00,13:00-18:00;;;;;";
  const base: AppointmentFormValues = { patientId: "", professionalId: "", date: "2099-01-12", startTime: "", endTime: "", notes: "" };
  const renderWith = (initial: Partial<AppointmentFormValues>, appointmentId?: string) =>
    render(
      <AppointmentForm
        action={jest.fn()}
        initial={{ ...base, ...initial }}
        professionals={[]}
        patientPicker={appointmentId ? undefined : { initial: null }}
        patientName={appointmentId ? "PACIENTE" : undefined}
        appointmentId={appointmentId}
        businessHours={HOURS}
        cancelHref="/agenda"
        submitLabel="Agendar"
      />,
    );
  const options = (label: string) =>
    Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((option) => option.value).filter(Boolean);

  it("oferece só inícios dentro do expediente e fins até o fechamento do intervalo", () => {
    renderWith({});
    const starts = options("Início *");
    expect(starts[0]).toBe("08:00");
    expect(starts).not.toContain("12:00");
    expect(starts).not.toContain("12:30");
    expect(starts).toContain("13:00");
    expect(screen.getByLabelText("Fim *")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Início *"), { target: { value: "11:00" } });
    const ends = options("Fim *");
    expect(ends[0]).toBe("11:05");
    expect(ends.at(-1)).toBe("12:00");
    expect(screen.getByText(/Expediente: Seg 08:00–12:00, 13:00–18:00/)).toBeInTheDocument();
  });

  it("dia fechado desabilita os horários e orienta a escolher outra data", () => {
    renderWith({ date: "2099-01-11" });
    expect(screen.getByLabelText("Início *")).toBeDisabled();
    expect(screen.getByText(/não tem expediente neste dia/)).toBeInTheDocument();
  });

  it("trocar para um dia fechado limpa início e fim já escolhidos", () => {
    renderWith({ startTime: "09:00", endTime: "10:00" });
    fireEvent.change(screen.getByLabelText("Data *"), { target: { value: "2099-01-11" } });
    expect((screen.getByLabelText("Início *") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Fim *") as HTMLSelectElement).value).toBe("");
  });

  it("reagendar um horário antigo fora do expediente pede um novo horário", () => {
    renderWith({ startTime: "19:00", endTime: "20:00" }, "a1");
    expect((screen.getByLabelText("Início *") as HTMLSelectElement).value).toBe("");
    expect(screen.getByText(/horário atual está fora do expediente/)).toBeInTheDocument();
  });
});
