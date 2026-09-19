import { render, screen } from "@testing-library/react";
import DocumentosPacientePage from "../page";

const actor = { id: "u1", name: "Ana", email: "ana@example.com", role: "FISIOTERAPEUTA" };
const getCurrentAnamnesis = jest.fn();

jest.mock("@/modules/auth/dal", () => ({
  requirePermission: jest.fn(async () => actor),
}));

jest.mock("@/modules/pacientes/queries", () => ({
  getPatient: jest.fn().mockResolvedValue({ id: "p1", fullName: "Carla Dias" }),
}));

jest.mock("@/modules/clinico/queries", () => ({
  getCurrentAnamnesis: (...args: unknown[]) => getCurrentAnamnesis(...args),
}));

const props = { params: Promise.resolve({ id: "p1" }), searchParams: Promise.resolve({}) };

beforeEach(() => {
  jest.clearAllMocks();
  actor.role = "FISIOTERAPEUTA";
  getCurrentAnamnesis.mockResolvedValue({ id: "a1" });
});

describe("Documentos do paciente", () => {
  it("lista os 3 documentos com links de impressão em nova aba", async () => {
    render(await DocumentosPacientePage(props));
    const links = screen.getAllByRole("link", { name: /abrir para imprimir/i });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/impressao/pacientes/p1/termo-consentimento",
      "/impressao/pacientes/p1/cartao-frequencia",
      "/impressao/pacientes/p1/anamnese",
    ]);
    links.forEach((link) => expect(link).toHaveAttribute("target", "_blank"));
  });

  it("sem anamnese registrada, a ficha de anamnese fica indisponível", async () => {
    getCurrentAnamnesis.mockResolvedValue(null);
    render(await DocumentosPacientePage(props));
    expect(screen.getByText("Nenhuma anamnese registrada.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /abrir para imprimir/i })).toHaveLength(2);
  });

  it("sem clinico:ler, não mostra nem consulta a anamnese", async () => {
    actor.role = "RECEPCAO";
    render(await DocumentosPacientePage(props));
    expect(screen.queryByText("Ficha de anamnese")).not.toBeInTheDocument();
    expect(getCurrentAnamnesis).not.toHaveBeenCalled();
  });
});
