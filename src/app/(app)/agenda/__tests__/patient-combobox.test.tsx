import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { PatientOption, PatientSearchResult } from "@/modules/agenda/actions";

jest.mock("@/modules/agenda/actions", () => ({ searchActivePatients: jest.fn() }));

import { PatientCombobox } from "../patient-combobox";

type Deferred = { query: string; resolve: (result: PatientSearchResult) => void; reject: (error: unknown) => void };

function setup(initial: PatientOption | null = null) {
  const calls: Deferred[] = [];
  const search = jest.fn(
    (query: string) => new Promise<PatientSearchResult>((resolve, reject) => calls.push({ query, resolve, reject })),
  );
  function Harness() {
    const [value, setValue] = useState<PatientOption | null>(initial);
    return (
      <form data-testid="form" onSubmit={(event) => event.preventDefault()}>
        <PatientCombobox name="patientId" value={value} onChange={setValue} search={search} />
      </form>
    );
  }
  render(<Harness />);
  const input = screen.getByRole("combobox", { name: /Paciente/ });
  const hidden = () =>
    (screen.getByTestId("form") as HTMLFormElement).elements.namedItem("patientId") as HTMLInputElement;
  return { input, hidden, search, calls };
}

async function flush() {
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
}

async function answer(call: Deferred, result: PatientSearchResult) {
  await act(async () => call.resolve(result));
}

const ana = { id: "p1", label: "Ana Souza" };
const bruno = { id: "p2", label: "Bruno Lima" };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("PatientCombobox", () => {
  it("busca com debounce, mostra carregando e resultados, e escolhe pelo teclado", async () => {
    const { input, hidden, search, calls } = setup();
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "an" } });
    expect(search).not.toHaveBeenCalled();
    await flush();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("an");
    expect(screen.getByText("Buscando…")).toBeInTheDocument();
    await answer(calls[0], { items: [ana, bruno], hasMore: false });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("2 pacientes encontrados.");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toMatch(/opcao-p2$/);
    // Enter com a lista aberta escolhe a opção e não envia o formulário.
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
    expect(hidden().value).toBe("p2");
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("refinar a busca não perde o paciente selecionado", async () => {
    const { input, hidden, calls } = setup(ana);
    expect(hidden().value).toBe("p1");
    fireEvent.change(input, { target: { value: "bru" } });
    await flush();
    await answer(calls[0], { items: [], hasMore: false });
    expect(screen.getByText("Nenhum paciente ativo encontrado.", { selector: "p:not([role=status])" })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(hidden().value).toBe("p1");
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
  });

  it("descarta respostas fora de ordem", async () => {
    const { input, calls } = setup();
    fireEvent.change(input, { target: { value: "an" } });
    await flush();
    fireEvent.change(input, { target: { value: "bru" } });
    await flush();
    expect(calls.map((call) => call.query)).toEqual(["an", "bru"]);
    await answer(calls[1], { items: [bruno], hasMore: false });
    await answer(calls[0], { items: [ana], hasMore: false });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Bruno Lima");
  });

  it("mostra erro quando a busca falha e avisa quando há mais resultados", async () => {
    const { input, calls } = setup();
    fireEvent.focus(input);
    await flush();
    await act(async () => calls[0].reject(new Error("rede")));
    expect(
      screen.getByText("Não foi possível buscar pacientes. Tente novamente.", { selector: "p:not([role=status])" }),
    ).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "p" } });
    await flush();
    await answer(calls[1], { items: [ana], hasMore: true });
    expect(screen.getByText(/Refine a busca/)).toBeInTheDocument();
  });

  it("acesso negado aparece como erro, sem opções", async () => {
    const { input, calls } = setup();
    fireEvent.focus(input);
    await flush();
    await answer(calls[0], { error: "Acesso negado." });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("Acesso negado.", { selector: "p:not([role=status])" })).toBeInTheDocument();
  });

  it("clique escolhe a opção e Escape fecha a lista", async () => {
    const { input, hidden, calls } = setup();
    fireEvent.focus(input);
    await flush();
    await answer(calls[0], { items: [ana], hasMore: false });
    fireEvent.click(screen.getByRole("option", { name: "Ana Souza" }));
    expect(hidden().value).toBe("p1");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
});
