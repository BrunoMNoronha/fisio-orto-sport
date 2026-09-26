import { render, screen, within } from "@testing-library/react";
import type { ReassessmentDetail } from "@/modules/clinico/reassessment-queries";
import { ReassessmentComparison, ReassessmentConclusionView } from "../reassessment-view";

const exam = { inspection: null, palpation: null, functionalGait: null, rangeOfMotion: null, muscleStrength: null, specialTests: null };

const reassessment = {
  id: "re2",
  planId: "pl1",
  assessmentId: "av1",
  previousReassessmentId: "re1",
  reference: {
    assessment: { id: "av1", version: 3, assessmentDate: "2026-09-01", diagnosis: "Tendinopatia", ...exam, rangeOfMotion: "Flexão 90 graus" },
    previous: {
      id: "re1",
      reassessmentDate: "2026-09-10",
      painLimitations: "Dor 7/10",
      progressSummary: "Início",
      goalsStatus: "NAO_ATINGIDOS",
      conclusion: "CONTINUIDADE",
      ...exam,
      rangeOfMotion: "Flexão 120 graus",
    },
  },
  reassessmentDate: new Date("2026-09-20T00:00:00.000Z"),
  ...exam,
  rangeOfMotion: "Flexão 150 graus",
  painLimitations: null,
  progressSummary: "Melhora da ADM",
  goalsStatus: "PARCIALMENTE_ATINGIDOS",
  goalsJustification: "Dor ainda limita esportes",
  conclusion: "AJUSTE_PLANO",
  conclusionSummary: "Progredir carga",
  version: 1,
  authorNameSnapshot: "Bruna Lima",
  authorCrefitoSnapshot: "123456-F",
  createdAt: new Date("2026-09-20T13:00:00.000Z"),
  updatedAt: new Date("2026-09-20T13:00:00.000Z"),
  planRevision: { number: 2, planDate: new Date("2026-09-10T00:00:00.000Z"), goals: "Recuperar ADM" },
  plan: { status: "ATIVO", currentRevision: 2 },
  resultingRevision: null,
  adjustmentPending: true,
} as unknown as ReassessmentDetail;

describe("ReassessmentComparison", () => {
  it("mostra origem, anterior e atual lado a lado, com datas, versão e 'Não informado' — sem cálculos", () => {
    render(<ReassessmentComparison reassessment={reassessment} />);
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual([
      "Achado",
      "Avaliação de origem (01/09/2026, versão 3)",
      "Reavaliação anterior (10/09/2026)",
      "Esta reavaliação (20/09/2026)",
    ]);
    const adm = within(table).getByRole("row", { name: /Amplitude de movimento/ });
    expect(within(adm).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "Flexão 90 graus",
      "Flexão 120 graus",
      "Flexão 150 graus",
    ]);
    const pain = within(table).getByRole("row", { name: /Dor e limitações/ });
    expect(within(pain).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Não informado", "Dor 7/10", "Não informado"]);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("sem reavaliação anterior, a coluna não aparece", () => {
    render(<ReassessmentComparison reassessment={{ ...reassessment, reference: { ...reassessment.reference, previous: null } }} />);
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  });
});

describe("ReassessmentConclusionView", () => {
  it("mostra objetivos da revisão de referência, situação com justificativa e conclusão com pendência", () => {
    render(<ReassessmentConclusionView reassessment={reassessment} />);
    expect(screen.getByText("Objetivos da revisão 2 do plano (10/09/2026)")).toBeInTheDocument();
    expect(screen.getByText("Recuperar ADM")).toBeInTheDocument();
    expect(screen.getByText("Parcialmente atingidos")).toBeInTheDocument();
    expect(screen.getByText("Ajuste do plano")).toBeInTheDocument();
    expect(screen.getByText("Ajuste pendente")).toBeInTheDocument();
  });
});
