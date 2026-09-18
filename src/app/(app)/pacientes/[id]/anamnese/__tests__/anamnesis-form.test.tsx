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

function setup(action = jest.fn().mockResolvedValue(undefined)) {
  const view = render(
    <AnamnesisForm action={action} initial={initial} initialPainTypes={["PESO"]} cancelHref="/voltar" />,
  );
  const form = view.container.querySelector("form")!;
  return { action, form };
}

function section(name: RegExp) {
  return screen.getByRole("heading", { level: 2, name, hidden: true }).closest("section")!;
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
});
