jest.mock("@/modules/administrativo/actions", () => ({ saveOperator: jest.fn(), saveContract: jest.fn() }));
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { saveOperator, saveContract } from "@/modules/administrativo/actions";
import { ConfigForm } from "../config-form";

beforeEach(() => jest.clearAllMocks());
it("permite contrato pendente e envia identidade/versão sem preencher TISS automaticamente", async () => {
  (saveContract as jest.Mock).mockResolvedValue({ error: "Conflito. Recarregue." });
  render(<ConfigForm kind="contract" id="contract" operatorId="operator" requestId="request" expectedVersion={2}
    initial={{ name: "CONTRATO", providerCode: "00012", active: "false", reason: "Correção" }} cancelHref="/configuracoes/operadoras" />);
  expect(screen.getByLabelText("Versão TISS informada pela operadora")).toHaveValue("");
  fireEvent.submit(screen.getByRole("button", { name: "Salvar" }).closest("form")!);
  await waitFor(() => expect(saveContract).toHaveBeenCalled());
  const fd = (saveContract as jest.Mock).mock.calls[0][1] as FormData;
  expect([fd.get("operatorId"), fd.get("id"), fd.get("expectedVersion"), fd.get("requestId"), fd.get("providerCode"), fd.get("tissVersion")])
    .toEqual(["operator", "contract", "2", "request", "00012", ""]);
  expect(fd.get("maxGuides")).toBe("100");
  expect(fd.get("maxXmlBytes")).toBe("2097152");
  expect(await screen.findByRole("alert")).toHaveTextContent("Conflito");
  expect(screen.getByLabelText("Situação")).toHaveValue("false");
});
it("associa erro ao campo e conserva o valor digitado", async () => {
  (saveOperator as jest.Mock).mockResolvedValue({ error: "Corrija", fieldErrors: { registrationAns: ["Seis dígitos"] } });
  render(<ConfigForm kind="operator" id="operator" requestId="request" expectedVersion={0}
    initial={{ name: "OPERADORA", registrationAns: "", active: "true", reason: "Inicial" }} cancelHref="/configuracoes/operadoras" />);
  const ans = screen.getByLabelText("Registro ANS");
  fireEvent.change(ans, { target: { value: "00012" } });
  fireEvent.submit(screen.getByRole("button", { name: "Salvar" }).closest("form")!);
  expect(await screen.findByText("Seis dígitos")).toBeInTheDocument();
  expect(ans).toHaveValue("00012"); expect(ans).toHaveAttribute("aria-invalid", "true");
  expect(ans.getAttribute("aria-describedby")).toContain("registrationAns-error");
});
