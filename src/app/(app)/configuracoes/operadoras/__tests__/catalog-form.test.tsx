jest.mock("@/modules/administrativo/catalog-actions", () => ({ saveProcedure: jest.fn(), saveTariff: jest.fn(), saveProfessional: jest.fn() }));
import { render, screen, fireEvent } from "@testing-library/react";
import { saveTariff } from "@/modules/administrativo/catalog-actions";
import { CatalogForm } from "../../catalog-form";
it("exibe códigos imutáveis após criação, preservando zeros", () => {
  render(<CatalogForm kind="procedure" id="p" requestId="r" version={1} parentId="c" initial={{ name: "Teste", tableCode: "00", code: "0001" }} cancelHref="/" />);
  expect(screen.getByLabelText("Código do procedimento *")).toHaveValue("0001");
  expect(screen.getByLabelText("Código do procedimento *")).toHaveAttribute("readonly");
});
it("mantém valor, vigência e situação após rejeição de sobreposição", async () => {
  (saveTariff as jest.Mock).mockResolvedValue({ error: "Período sobreposto", fieldErrors: { endsOn: ["Revise o fim"] } });
  render(<CatalogForm kind="tariff" id="t" requestId="r" version={0} parentId="p"
    initial={{ amount: "123,45", startsOn: "2026-01-01", endsOn: "", active: "false", reason: "Teste" }} cancelHref="/" />);
  fireEvent.submit(screen.getByRole("button", { name: "Salvar" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Período sobreposto");
  expect(screen.getByLabelText("Valor unitário (R$) *")).toHaveValue("123,45");
  expect(screen.getByLabelText("Início da vigência *")).toHaveValue("2026-01-01");
  expect(screen.getByLabelText("Situação")).toHaveValue("false");
  expect(screen.getByLabelText("Fim da vigência (opcional)")).toHaveAttribute("aria-describedby", "endsOn-error");
});
it("conserva a data ao editar outro campo após entrada nativa", () => {
  render(<CatalogForm kind="tariff" id="t" requestId="r" version={0} parentId="p" initial={{ active: "true" }} cancelHref="/" />);
  fireEvent.input(screen.getByLabelText("Início da vigência *"), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText("Motivo do registro ou alteração *"), { target: { value: "Cadastro" } });
  expect(screen.getByLabelText("Início da vigência *")).toHaveValue("2026-10-01");
});
