import { render, screen } from "@testing-library/react";
import type { SessionChangeItem, SessionDetail } from "@/modules/clinico/session-queries";
import { SessionHistory, SessionView } from "../session-view";

const session: SessionDetail = {
  id: "s1",
  planId: "pl1",
  occurredAt: new Date("2026-09-20T17:30:00.000Z"),
  professionalId: "f1",
  professionalNameSnapshot: "Bruna Lima",
  professionalCrefitoSnapshot: "123456-F",
  techniques: "Liberação miofascial",
  exercises: null,
  observations: null,
  evolution: "Melhora da ADM",
  nextSteps: "Progredir carga",
  status: "VALIDO",
  invalidationReason: null,
  invalidatedAt: null,
  invalidatedByNameSnapshot: null,
  version: 1,
  authorNameSnapshot: "Administrador",
  authorCrefitoSnapshot: null,
  createdAt: new Date("2026-09-21T12:00:00.000Z"),
  updatedAt: new Date("2026-09-21T12:00:00.000Z"),
  planRevision: { number: 1, planDate: new Date("2026-09-01T00:00:00.000Z"), plannedSessions: 10 },
  plan: { status: "ATIVO", currentRevision: 2 },
};

describe("SessionView", () => {
  it("mostra evolução, responsável x autor, momento clínico x lançamento e a revisão exata aplicada", () => {
    render(<SessionView session={session} />);
    expect(screen.getByText("Melhora da ADM")).toBeInTheDocument();
    expect(screen.getAllByText("Não informado")).toHaveLength(2);
    expect(screen.getByText("20/09/2026 14:30")).toBeInTheDocument();
    expect(screen.getByText("Bruna Lima (CREFITO 123456-F)")).toBeInTheDocument();
    expect(screen.getByText("Administrador em 21/09/2026, 09:00")).toBeInTheDocument();
    // A revisão aplicada foi a 1, mesmo o plano estando hoje na 2.
    expect(screen.getByText("Revisão 1, de 01/09/2026 (substituída depois)")).toBeInTheDocument();
  });
});

describe("SessionHistory", () => {
  it("agrupa correções com motivo, antes/depois e assinatura", () => {
    const changes: SessionChangeItem[] = [
      {
        id: "c1",
        version: 2,
        field: "occurredAt",
        previousValue: "20/09/2026 14:30",
        newValue: "20/09/2026 15:00",
        reason: "Hora digitada errada",
        editorNameSnapshot: "Bruna Lima",
        editorCrefitoSnapshot: "123456-F",
        changedAt: new Date("2026-09-22T12:00:00.000Z"),
      },
    ];
    const { container } = render(<SessionHistory changes={changes} />);
    expect(container.querySelector("summary")).toHaveTextContent(
      "Correção de 22/09/2026, 09:00 · Bruna Lima (CREFITO 123456-F) · 1 campo alterado",
    );
    expect(screen.getByText("Hora digitada errada")).toBeInTheDocument();
    expect(screen.getByText("Data e hora do atendimento")).toBeInTheDocument();
    expect(screen.getByText("20/09/2026 15:00")).toBeInTheDocument();
  });

  it("estado vazio", () => {
    render(<SessionHistory changes={[]} />);
    expect(screen.getByText("Nenhuma correção desde o registro.")).toBeInTheDocument();
  });
});
