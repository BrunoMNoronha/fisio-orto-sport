// A navegação por teclado (setas, Home, End) é do Base UI e depende de layout real: conferida no
// navegador (evidências da #78), não no jsdom.
import { act, fireEvent, render, screen } from "@testing-library/react";

const save = jest.fn();
jest.mock("@/modules/configuracoes/actions", () => ({
  saveSettings: (...args: unknown[]) => save(...args),
}));

import { DEFAULT_SETTINGS } from "@/modules/configuracoes/settings";
import { SettingsForm } from "../settings-form";

function setup(devPanel: React.ReactNode = null) {
  render(
    <SettingsForm
      initial={DEFAULT_SETTINGS}
      version={3}
      lastChange={null}
      canManage
      timezone="America/Sao_Paulo"
      links={{ users: true, audit: true }}
      devPanel={devPanel}
    />,
  );
}

beforeEach(() => {
  save.mockReset();
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  };
});

describe("Configurações em abas (#78)", () => {
  it("abas acessíveis; Desenvolvimento só aparece com ferramentas habilitadas", () => {
    setup();
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual(["Clínica", "Agenda e expediente", "Impressões", "Administração"]);
    expect(screen.getByRole("tab", { name: "Clínica" })).toHaveAttribute("aria-selected", "true");
  });

  it("mostra a aba Desenvolvimento quando o servidor envia o painel", () => {
    setup(<p>Ferramentas</p>);
    fireEvent.click(screen.getByRole("tab", { name: "Desenvolvimento" }));
    expect(screen.getByText("Ferramentas")).toBeVisible();
  });

  it("trocar de aba não perde a edição nem salva sozinho; aba alterada fica marcada", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Nome de exibição"), { target: { value: "Clínica Nova" } });
    fireEvent.click(screen.getByRole("tab", { name: "Impressões" }));
    expect(screen.getByLabelText("Mostrar a identificação da clínica nas impressões")).toBeVisible();
    expect(screen.getByRole("tab", { name: /Clínica.*alterada, não salva/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Clínica/ }));
    expect(screen.getByLabelText("Nome de exibição")).toHaveValue("Clínica Nova");
    expect(save).not.toHaveBeenCalled();
  });

  it("erro em aba oculta abre a aba certa e leva o foco ao campo", async () => {
    save.mockResolvedValue({
      error: "Corrija os campos destacados. Nada foi salvo.",
      fieldErrors: { businessHoursEnabled: ["Defina ao menos um dia com expediente antes de aplicá-lo à agenda."] },
    });
    setup();
    fireEvent.change(screen.getByLabelText("Nome de exibição"), { target: { value: "X" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar configurações" }));
    });
    expect(screen.getByRole("tab", { name: /Agenda e expediente.*com erros/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Aplicar o expediente à agenda")).toHaveFocus();
    expect(screen.getByText(/ao menos um dia com expediente/)).toBeVisible();
  });

  it("editor do expediente monta o texto canônico enviado no formulário", async () => {
    save.mockResolvedValue({ ok: true, message: "Configurações salvas.", version: 4 });
    setup();
    fireEvent.click(screen.getByRole("tab", { name: "Agenda e expediente" }));
    fireEvent.click(screen.getByLabelText("Segunda"));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar pausa (Segunda)" }));
    fireEvent.click(screen.getByLabelText("Sábado"));
    fireEvent.change(screen.getByLabelText("Sábado: fim do 1º intervalo"), { target: { value: "11:00" } });
    fireEvent.click(screen.getByLabelText("Aplicar o expediente à agenda"));
    expect(screen.getByText(/Resumo: Seg 08:00–12:00, 13:00–18:00 · Sáb 08:00–11:00/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar configurações" }));
    });
    const formData = save.mock.calls[0][1] as FormData;
    expect(formData.get("businessHours")).toBe(";08:00-12:00,13:00-18:00;;;;;08:00-11:00");
    expect(formData.get("businessHoursEnabled")).toBe("on");
    expect(formData.get("expectedVersion")).toBe("3");
  });
});
