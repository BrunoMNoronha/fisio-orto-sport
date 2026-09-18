import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ANAMNESIS_TEXT_FIELDS } from "@/modules/clinico/validation";
import { AnamnesisForm, type AnamnesisFormValues } from "../anamnesis-form";

const initial: AnamnesisFormValues = {
  assessmentDate: "2026-09-18",
  chiefComplaint: "Dor no ombro",
  currentIllnessHistory: "",
  personalPathologicalHistory: "",
  surgeries: "",
  currentMedications: "",
  habitsPhysicalActivity: "",
  painIntensity: "",
  painLocation: "",
  functionalLimitations: "",
  patientGoals: "",
  clinicalNotes: "",
};

function setup(action = jest.fn().mockResolvedValue(undefined), values: Partial<AnamnesisFormValues> = {}) {
  const view = render(
    <AnamnesisForm
      action={action}
      initial={{ ...initial, ...values }}
      initialPainTypes={["PESO"]}
      cancelHref="/voltar"
    />,
  );
  const form = view.container.querySelector("form")!;
  return { action, form };
}

const enter = (element: Element) => fireEvent.keyDown(element, { key: "Enter", code: "Enter" });

function cancelLink() {
  return screen.getByRole("link", { name: "Cancelar" });
}

function section(name: RegExp) {
  return screen.getByRole("heading", { level: 3, name, hidden: true }).closest("section")!;
}

describe("AnamnesisForm em etapas", () => {
  beforeAll(() => {
    // jsdom não implementa rolagem.
    Element.prototype.scrollIntoView = jest.fn();
  });

  it("mostra só a primeira etapa e avança pelo rodapé", () => {
    setup();
    expect(section(/Queixa principal/)).toBeVisible();
    expect(section(/Dor/)).not.toBeVisible();
    expect(screen.getByText(/Etapa 1 de 4/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Próxima etapa: Dor/ }));

    expect(section(/Dor/)).toBeVisible();
    expect(section(/Queixa principal/)).not.toBeVisible();
    expect(screen.getByText(/Etapa 2 de 4/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dor/, current: "step" })).toBeInTheDocument();
  });

  it("mantém todos os campos no formulário mesmo com etapas ocultas", () => {
    const { form } = setup();
    const data = new FormData(form);
    for (const name of ANAMNESIS_TEXT_FIELDS) expect(data.has(name)).toBe(true);
    expect(data.getAll("painTypes")).toEqual(["PESO"]);
  });

  it("envia a intensidade escolhida na escala EVA", () => {
    const { form } = setup();
    expect(new FormData(form).get("painIntensity")).toBe("");
    fireEvent.click(screen.getByRole("radio", { name: "Dor 4", hidden: true }));
    expect(new FormData(form).get("painIntensity")).toBe("4");
  });

  it("leva à primeira etapa com erro retornado pela action", async () => {
    const action = jest.fn().mockResolvedValue({
      fieldErrors: { habitsPhysicalActivity: ["Campo muito longo."] },
    });
    setup(action);

    fireEvent.click(screen.getByRole("button", { name: "Salvar anamnese" }));

    await waitFor(() => expect(section(/Histórico clínico/)).toBeVisible());
    expect(screen.getByText("Campo muito longo.")).toBeVisible();
    expect(screen.getByRole("button", { name: /Histórico clínico \(com erro\)/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("preserva escala e características após um erro, para o reenvio", async () => {
    const { form } = setup(jest.fn(async () => ({ error: "Falha ao salvar." })));
    fireEvent.click(screen.getByRole("radio", { name: "Dor 4", hidden: true }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Peso/, hidden: true }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Pontada/, hidden: true }));

    fireEvent.click(screen.getByRole("button", { name: "Salvar anamnese" }));
    await waitFor(() => expect(screen.getByText("Falha ao salvar.")).toBeInTheDocument());

    const data = new FormData(form);
    expect(data.get("painIntensity")).toBe("4");
    expect(data.getAll("painTypes")).toEqual(["PONTADA"]);
  });

  describe("Enter", () => {
    it("na data e na localização avança de etapa sem enviar", () => {
      const { action } = setup();

      expect(enter(screen.getByLabelText(/Data da avaliação/))).toBe(false);
      expect(section(/Dor/)).toBeVisible();

      expect(enter(screen.getByLabelText("Localização"))).toBe(false);
      expect(section(/Histórico clínico/)).toBeVisible();
      expect(action).not.toHaveBeenCalled();
    });

    it("em textarea mantém o comportamento nativo (quebra de linha)", () => {
      setup();
      expect(enter(screen.getByLabelText(/nas palavras do paciente/))).toBe(true);
      expect(section(/Queixa principal/)).toBeVisible();
    });

    it("na última etapa não é interceptado", () => {
      setup();
      fireEvent.click(screen.getByRole("button", { name: /Funcional e objetivos/ }));
      expect(enter(screen.getByLabelText("Observações clínicas"))).toBe(true);
      expect(section(/Funcional e objetivos/)).toBeVisible();
    });
  });

  describe("alterações não salvas", () => {
    let confirm: jest.SpyInstance;
    beforeEach(() => {
      confirm = jest.spyOn(window, "confirm");
    });
    afterEach(() => confirm.mockRestore());

    const beforeUnload = () => window.dispatchEvent(new Event("beforeunload", { cancelable: true }));

    it("sem alterações, sai sem aviso", () => {
      setup();
      expect(fireEvent.click(cancelLink())).toBe(true);
      expect(confirm).not.toHaveBeenCalled();
      expect(beforeUnload()).toBe(true);
    });

    it("com alterações, pede confirmação ao cancelar e registra beforeunload", () => {
      setup();
      fireEvent.change(screen.getByLabelText(/nas palavras do paciente/), { target: { value: "Dor no joelho" } });

      confirm.mockReturnValueOnce(false);
      expect(fireEvent.click(cancelLink())).toBe(false);
      expect(confirm).toHaveBeenCalledTimes(1);

      confirm.mockReturnValueOnce(true);
      expect(fireEvent.click(cancelLink())).toBe(true);

      expect(beforeUnload()).toBe(false);
    });

    it("desmarcar uma característica também conta como alteração", () => {
      setup();
      fireEvent.click(screen.getByRole("checkbox", { name: /Peso/i, hidden: true }));
      expect(beforeUnload()).toBe(false);
    });
  });

  describe("foco após erro de validação", () => {
    it("abre a etapa oculta e foca o primeiro campo inválido", async () => {
      setup(jest.fn().mockResolvedValue({ fieldErrors: { habitsPhysicalActivity: ["Campo muito longo."] } }));
      fireEvent.click(screen.getByRole("button", { name: "Salvar anamnese" }));
      await waitFor(() => expect(screen.getByLabelText("Hábitos e atividade física")).toHaveFocus());
    });

    it("foca o campo inválido quando o erro está na etapa atual", async () => {
      setup(jest.fn().mockResolvedValue({ fieldErrors: { chiefComplaint: ["Informe a queixa principal."] } }));
      fireEvent.click(screen.getByRole("button", { name: "Salvar anamnese" }));
      await waitFor(() => expect(screen.getByLabelText(/nas palavras do paciente/)).toHaveFocus());
      expect(section(/Queixa principal/)).toBeVisible();
    });

    it("segue a ordem dos campos entre etapas", async () => {
      setup(
        jest.fn().mockResolvedValue({
          fieldErrors: { clinicalNotes: ["x"], painLocation: ["Campo muito longo."] },
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Salvar anamnese" }));
      await waitFor(() => expect(screen.getByLabelText("Localização")).toHaveFocus());
    });

    it("na escala de dor foca o nível marcado", async () => {
      setup(jest.fn().mockResolvedValue({ fieldErrors: { painIntensity: ["Valor inválido."] } }));
      fireEvent.click(screen.getByRole("radio", { name: "Dor 4", hidden: true }));
      fireEvent.click(screen.getByRole("button", { name: "Salvar anamnese" }));
      await waitFor(() => expect(screen.getByRole("radio", { name: "Dor 4" })).toHaveFocus());
    });

    it("nas características foca a primeira opção", async () => {
      setup(jest.fn().mockResolvedValue({ fieldErrors: { painTypes: ["Opção inválida."] } }));
      fireEvent.click(screen.getByRole("button", { name: "Salvar anamnese" }));
      await waitFor(() => expect(screen.getAllByRole("checkbox")[0]).toHaveFocus());
    });
  });

  it("não marca a etapa 1 como preenchida sem queixa principal", () => {
    setup(undefined, { chiefComplaint: "" });
    fireEvent.click(screen.getByRole("button", { name: /Próxima etapa: Dor/ }));
    expect(screen.getByRole("button", { name: /Queixa principal/ })).toHaveTextContent(/^1Queixa principal$/);

    fireEvent.click(screen.getByRole("button", { name: /Queixa principal/ }));
    fireEvent.change(screen.getByLabelText(/nas palavras do paciente/), { target: { value: "Dor lombar" } });
    fireEvent.click(screen.getByRole("button", { name: /Próxima etapa: Dor/ }));
    expect(screen.getByRole("button", { name: /Queixa principal/ })).toHaveTextContent(/^Queixa principal$/);
  });

  it("mantém a região do erro geral montada e reanuncia erros repetidos", async () => {
    const { form } = setup(jest.fn(async () => ({ error: "Falha ao salvar." })));
    const region = form.querySelector("#anamnese-erro-geral")!;
    expect(region).toHaveAttribute("role", "alert");
    expect(region).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "Salvar anamnese" }));
    await waitFor(() => expect(region).toHaveTextContent("Falha ao salvar."));
    const first = region.firstElementChild;

    fireEvent.click(screen.getByRole("button", { name: "Salvar anamnese" }));
    await waitFor(() => expect(region.firstElementChild).not.toBe(first));
    expect(region).toHaveTextContent("Falha ao salvar.");
  });
});
