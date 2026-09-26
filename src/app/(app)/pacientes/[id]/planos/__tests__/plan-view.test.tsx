import { render, screen } from "@testing-library/react";
import type { PlanRevisionDetail, PlanRevisionItem } from "@/modules/clinico/plan-queries";
import { PlanRevisionList, PlanRevisionView, PlanStatusHistory } from "../plan-view";

const revision: PlanRevisionDetail = {
  id: "r2",
  number: 2,
  kind: "CORRECAO",
  reason: "Erro de digitação na conduta",
  planDate: new Date("2026-09-10T00:00:00.000Z"),
  goals: "Reduzir dor",
  conduct: "Cinesioterapia",
  techniques: null,
  exercises: "Ponte",
  plannedSessions: 10,
  frequency: "2x por semana",
  reassessment: null,
  notes: null,
  authorNameSnapshot: "Bruna Lima",
  authorCrefitoSnapshot: "123456-F",
  createdAt: new Date("2026-09-11T13:00:00.000Z"),
};

describe("PlanRevisionView", () => {
  it("mostra conteúdo, 'Não informado', tipo/motivo, data clínica e assinatura", () => {
    render(<PlanRevisionView revision={revision} />);
    expect(screen.getByText("Cinesioterapia")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getAllByText("Não informado")).toHaveLength(3);
    expect(screen.getByText("Correção de erro de registro: Erro de digitação na conduta")).toBeInTheDocument();
    expect(screen.getByText("10/09/2026")).toBeInTheDocument();
    expect(screen.getByText("Bruna Lima (CREFITO 123456-F) em 11/09/2026, 10:00")).toBeInTheDocument();
  });
});

describe("PlanRevisionList", () => {
  it("identifica a vigente sem ambiguidade e aponta cada revisão para o seu conteúdo", () => {
    const revisions: PlanRevisionItem[] = [
      { ...revision, id: "r2", motivatingReassessment: null },
      {
        ...revision,
        id: "r1",
        number: 1,
        kind: "INICIAL",
        reason: null,
        authorCrefitoSnapshot: null,
        authorNameSnapshot: "Admin",
        motivatingReassessment: null,
      },
    ];
    render(<PlanRevisionList revisions={revisions} current={2} hrefFor={(n) => `/r/${n}`} />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/r/2", "/r/1"]);
    expect(links[0]).toHaveTextContent("Revisão 2 · Correção de erro de registroVigente");
    expect(links[1]).toHaveTextContent("Revisão 1 · Versão inicial");
    expect(links[1]).not.toHaveTextContent("Vigente");
    expect(screen.getAllByText("Vigente")).toHaveLength(1);
  });
});

describe("PlanStatusHistory", () => {
  it("lista encerramentos e reaberturas com motivo, ou o estado vazio", () => {
    const { rerender } = render(<PlanStatusHistory changes={[]} />);
    expect(screen.getByText("Sem mudanças de estado desde a criação.")).toBeInTheDocument();
    rerender(
      <PlanStatusHistory
        changes={[
          {
            id: "s1",
            fromStatus: "ATIVO",
            toStatus: "ENCERRADO",
            reason: "Objetivos atingidos",
            authorNameSnapshot: "Admin",
            authorCrefitoSnapshot: null,
            createdAt: new Date("2026-09-20T12:00:00.000Z"),
          },
        ]}
      />,
    );
    expect(screen.getByText("Encerrado em 20/09/2026, 09:00")).toBeInTheDocument();
    expect(screen.getByText("Motivo: Objetivos atingidos")).toBeInTheDocument();
  });
});
