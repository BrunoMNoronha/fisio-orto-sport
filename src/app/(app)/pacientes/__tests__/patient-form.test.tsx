import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("PatientForm — máscaras de CPF e telefone", () => {
  it("aplica a máscara enquanto digita", () => {
    setup();
    const cpf = screen.getByLabelText("CPF (opcional)") as HTMLInputElement;
    const phone = screen.getByLabelText("Telefone *") as HTMLInputElement;
    fireEvent.change(cpf, { target: { value: "11144477735" } });
    fireEvent.change(phone, { target: { value: "11987654321" } });
    expect(cpf.value).toBe("111.444.777-35");
    expect(phone.value).toBe("(11) 98765-4321");
  });
});

describe("PatientForm — plano de saúde", () => {
  it("campos opcionais carregam valores e preservam zeros e letras sem máscara", () => {
    setup({ ...EMPTY_PATIENT, healthInsuranceProvider: "Teste", healthInsurancePlan: "Plano", healthInsuranceCard: "000Ab", healthInsuranceValidUntil: "2024-02-29" });
    for (const [label, value, max] of [["Operadora / convênio (opcional)", "Teste", 120], ["Nome do plano (opcional)", "Plano", 120], ["Número da carteirinha (opcional)", "000Ab", 60]] as const) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input.value).toBe(value);
      expect(input.required).toBe(false);
      expect(input.maxLength).toBe(max);
    }
    const validity = screen.getByLabelText("Validade da carteirinha (opcional)") as HTMLInputElement;
    expect(validity.value).toBe("2024-02-29");
    expect(validity.type).toBe("date");
    expect(validity.required).toBe(false);
    fireEvent.change(screen.getByLabelText("Número da carteirinha (opcional)"), { target: { value: "000Cd-1/2" } });
    expect(screen.getByLabelText("Número da carteirinha (opcional)")).toHaveValue("000Cd-1/2");
  });
  it("mantém preenchimento após erro e associa mensagem ao campo", async () => {
    const action = jest.fn(async () => ({ fieldErrors: { healthInsuranceCard: ["Carteirinha inválida."] } }));
    render(<PatientForm action={action} cancelHref="/voltar" submitLabel="Salvar" />);
    const card = screen.getByLabelText("Número da carteirinha (opcional)");
    fireEvent.change(card, { target: { value: "000Ab" } });
    fireEvent.submit(card.closest("form")!);
    await waitFor(() => expect(screen.getByText("Carteirinha inválida.")).toBeInTheDocument());
    expect(card).toHaveValue("000Ab");
    expect(card).toHaveAttribute("aria-invalid", "true");
    expect(card).toHaveAttribute("aria-describedby", "paciente-healthInsuranceCard-erro");
  });
});
