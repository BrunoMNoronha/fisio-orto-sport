import { render, screen } from "@testing-library/react";
import { AppointmentForm, type AppointmentFormValues } from "../appointment-form";

function setup(date: string, startTime: string) {
  const initial: AppointmentFormValues = { patientId: "", professionalId: "", date, startTime, endTime: "", notes: "" };
  render(
    <AppointmentForm action={jest.fn()} initial={initial} professionals={[]} patients={[]} cancelHref="/agenda" submitLabel="Agendar" />,
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
