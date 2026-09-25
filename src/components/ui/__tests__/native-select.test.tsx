import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useActionState, useState } from "react";
import { NativeSelect, NativeSelectOption } from "../native-select";

type State = { error: string } | undefined;

// Formulário com action (React 19): após a action, o React reseta o <form> nativamente.
function Form({ action, initial = "" }: { action: (prev: State, formData: FormData) => Promise<State>; initial?: string }) {
  const [role, setRole] = useState(initial);
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} aria-label="formulário">
      {state?.error && <p role="alert">{state.error}</p>}
      <label htmlFor="perfil">Perfil</label>
      <NativeSelect id="perfil" name="role" value={role} onChange={(event) => setRole(event.target.value)}>
        <NativeSelectOption value="" disabled>
          Selecione
        </NativeSelectOption>
        <NativeSelectOption value="ADMIN">Administrador</NativeSelectOption>
        <NativeSelectOption value="FISIOTERAPEUTA">Fisioterapeuta</NativeSelectOption>
      </NativeSelect>
      <button type="submit">Salvar</button>
    </form>
  );
}

describe("NativeSelect controlado dentro de form com action", () => {
  it("mantém o valor escolhido depois do reset automático do form (erro de validação)", async () => {
    const action = jest.fn(async () => ({ error: "Erro de validação" }));
    render(<Form action={action} />);
    const select = screen.getByLabelText("Perfil") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "FISIOTERAPEUTA" } });
    expect(select.value).toBe("FISIOTERAPEUTA");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    });
    await screen.findByRole("alert");

    expect(action).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(select.value).toBe("FISIOTERAPEUTA"));
  });

  it("não troca um valor inicial por outra opção após o reset", async () => {
    const action = jest.fn(async () => ({ error: "Erro de validação" }));
    render(<Form action={action} initial="FISIOTERAPEUTA" />);
    const select = screen.getByLabelText("Perfil") as HTMLSelectElement;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    });
    await screen.findByRole("alert");

    await waitFor(() => expect(select.value).toBe("FISIOTERAPEUTA"));
  });

  it("reset manual do form também preserva o valor controlado", async () => {
    render(<Form action={jest.fn()} />);
    const select = screen.getByLabelText("Perfil") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "ADMIN" } });

    act(() => (screen.getByRole("form", { name: "formulário" }) as HTMLFormElement).reset());

    await waitFor(() => expect(select.value).toBe("ADMIN"));
  });
});
