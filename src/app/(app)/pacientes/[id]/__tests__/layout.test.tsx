import { render, screen } from "@testing-library/react";
import PacienteLayout from "../layout";

// Ficha do paciente: botões de gestão e abas seguem a matriz central (issue #31).
const actor = { id: "u1", name: "U", email: "u@example.com", role: "FISIOTERAPEUTA" };

jest.mock("@/modules/auth/dal", () => ({
  requirePermission: jest.fn(async () => actor),
}));

jest.mock("@/modules/pacientes/queries", () => ({
  getPatient: jest.fn().mockResolvedValue({
    id: "p1",
    fullName: "Paciente Fictício",
    birthDate: new Date("1990-01-01T00:00:00.000Z"),
    phone: "11987654321",
    status: "ATIVO",
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
  }),
}));

jest.mock("@/modules/pacientes/actions", () => ({ setPatientStatus: jest.fn() }));
jest.mock("next/navigation", () => ({ usePathname: () => "/pacientes/p1", notFound: jest.fn() }));

const props = { params: Promise.resolve({ id: "p1" }), children: <p>conteúdo</p> } as unknown as Parameters<
  typeof PacienteLayout
>[0];

describe("PacienteLayout — ações por perfil", () => {
  it("Fisioterapeuta: agenda, edita e inativa (acessos da Recepção) e mantém as abas clínicas", async () => {
    actor.role = "FISIOTERAPEUTA";
    render(await PacienteLayout(props));
    expect(screen.getByRole("link", { name: "Agendar" })).toHaveAttribute("href", "/agenda/novo?patientId=p1");
    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute("href", "/pacientes/p1/editar");
    expect(screen.getByRole("button", { name: "Inativar" })).toBeInTheDocument();
    for (const tab of ["Anamnese", "Avaliações", "Planos", "Sessões", "Reavaliações"]) {
      expect(screen.getByRole("link", { name: tab })).toBeInTheDocument();
    }
  });

  it("Recepção: mesmos botões de gestão, sem abas clínicas", async () => {
    actor.role = "RECEPCAO";
    render(await PacienteLayout(props));
    expect(screen.getByRole("link", { name: "Agendar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Editar" })).toBeInTheDocument();
    for (const tab of ["Anamnese", "Avaliações", "Planos", "Sessões", "Reavaliações"]) {
      expect(screen.queryByRole("link", { name: tab })).not.toBeInTheDocument();
    }
  });
});
