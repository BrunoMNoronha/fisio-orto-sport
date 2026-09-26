import { render, screen, within } from "@testing-library/react";
import type { AssessmentChangeItem, AssessmentDetail } from "@/modules/clinico/assessment-queries";
import { AssessmentHistory, AssessmentView } from "../assessment-view";

const assessment: AssessmentDetail = {
  id: "av1",
  patientId: "p1",
  anamnesisId: "an1",
  assessmentDate: new Date("2026-09-01T00:00:00.000Z"),
  inspection: null,
  palpation: "Dor no tubérculo maior",
  functionalGait: null,
  rangeOfMotion: "Ombro D, flexão 120 graus",
  muscleStrength: null,
  specialTests: null,
  diagnosis: "Tendinopatia do supraespinal",
  therapeuticGoals: null,
  clinicalNotes: null,
  version: 2,
  authorNameSnapshot: "Bruna Lima",
  authorCrefitoSnapshot: "123456-F",
  createdAt: new Date("2026-09-01T13:00:00.000Z"),
  updatedAt: new Date("2026-09-02T14:30:00.000Z"),
};

describe("AssessmentView", () => {
  it("mostra todos os campos, 'Não informado' nos vazios e distingue data clínica do registro", () => {
    render(<AssessmentView assessment={assessment} />);
    const exam = screen.getByRole("region", { name: "Exame físico" });
    expect(within(exam).getByText("Dor no tubérculo maior")).toBeInTheDocument();
    expect(within(exam).getAllByText("Não informado")).toHaveLength(4);
    expect(screen.getByText("Tendinopatia do supraespinal")).toBeInTheDocument();
    expect(screen.getByText("01/09/2026")).toBeInTheDocument();
    expect(screen.getByText("Bruna Lima (CREFITO 123456-F) em 01/09/2026, 10:00")).toBeInTheDocument();
    expect(screen.getByText("02/09/2026, 11:30")).toBeInTheDocument();
  });
});

describe("AssessmentHistory", () => {
  it("agrupa por edição (mais recente primeiro) com antes/depois e assinatura", () => {
    const changes: AssessmentChangeItem[] = [
      {
        id: "c3",
        version: 3,
        field: "diagnosis",
        previousValue: "Tendinopatia",
        newValue: "Síndrome do impacto",
        editorNameSnapshot: "Admin",
        editorCrefitoSnapshot: null,
        changedAt: new Date("2026-09-03T12:00:00.000Z"),
      },
      {
        id: "c2b",
        version: 2,
        field: "palpation",
        previousValue: null,
        newValue: "Dor",
        editorNameSnapshot: "Bruna Lima",
        editorCrefitoSnapshot: "123456-F",
        changedAt: new Date("2026-09-02T12:00:00.000Z"),
      },
      {
        id: "c2a",
        version: 2,
        field: "assessmentDate",
        previousValue: "2026-09-02",
        newValue: "2026-09-01",
        editorNameSnapshot: "Bruna Lima",
        editorCrefitoSnapshot: "123456-F",
        changedAt: new Date("2026-09-02T12:00:00.000Z"),
      },
    ];
    const { container } = render(<AssessmentHistory changes={changes} />);
    const summaries = [...container.querySelectorAll("summary")].map((item) => item.textContent);
    expect(summaries).toEqual([
      "Edição de 03/09/2026, 09:00 · Admin · 1 campo alterado",
      "Edição de 02/09/2026, 09:00 · Bruna Lima (CREFITO 123456-F) · 2 campos alterados",
    ]);
    const second = container.querySelectorAll("details")[1];
    const labels = [...second.querySelectorAll("dt")].map((item) => item.textContent);
    expect(labels).toEqual(["Data da avaliação", "Palpação"]);
    expect(second).toHaveTextContent("Antes02/09/2026");
    expect(second).toHaveTextContent("AntesNão informadoDepoisDor");
  });

  it("sem edições mostra estado vazio", () => {
    render(<AssessmentHistory changes={[]} />);
    expect(screen.getByText("Nenhuma edição desde o registro.")).toBeInTheDocument();
  });
});
