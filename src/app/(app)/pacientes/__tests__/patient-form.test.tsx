import { render, screen } from "@testing-library/react";
import { EMPTY_PATIENT, PatientForm } from "../patient-form";

function setup(initial = EMPTY_PATIENT) {
  render(<PatientForm action={jest.fn()} initial={initial} cancelHref="/voltar" submitLabel="Salvar" />);
}

describe("PatientForm — cadastro complementar (Fase 2c)", () => {
  it("oferece exatamente as opções de sexo definidas pela clínica e exige a escolha", () => {
    setup();
    const select = screen.getByLabelText("Sexo *") as HTMLSelectElement;
    expect(select.name).toBe("sex");
    expect(select.required).toBe(true);
    expect(select.value).toBe("");
    const options = Array.from(select.options).filter((option) => !option.disabled);
    expect(options.map((option) => [option.value, option.textContent])).toEqual([
      ["FEMININO", "Feminino"],
      ["MASCULINO", "Masculino"],
      ["NAO_INFORMADO", "Não informado"],
    ]);
  });

  it("profissão é opcional e limitada a 120 caracteres", () => {
    setup();
    const input = screen.getByLabelText("Profissão (opcional)") as HTMLInputElement;
    expect(input.name).toBe("occupation");
    expect(input.required).toBe(false);
    expect(input.maxLength).toBe(120);
  });

  it("na edição, carrega os valores gravados; cadastro antigo sem sexo começa sem seleção", () => {
    setup({ ...EMPTY_PATIENT, sex: "MASCULINO", occupation: "Motorista" });
    expect((screen.getByLabelText("Sexo *") as HTMLSelectElement).value).toBe("MASCULINO");
    expect((screen.getByLabelText("Profissão (opcional)") as HTMLInputElement).value).toBe("Motorista");
  });
});
