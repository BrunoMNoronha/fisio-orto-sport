import { LEGACY_CREFITO_NOTE, anamnesisCrefitoText, anamnesisSignatureLabel } from "../signature";

describe("assinatura da anamnese (MEL-03)", () => {
  it("versão nova com CREFITO", () => {
    const signature = { authorNameSnapshot: "Ana", authorCrefitoSnapshot: "123-F", authorCrefitoRecorded: true };
    expect(anamnesisSignatureLabel(signature)).toBe("Ana (CREFITO 123-F)");
    expect(anamnesisCrefitoText(signature)).toBe("CREFITO 123-F");
  });

  it("versão nova de autor sem CREFITO (ex.: Administrador) mostra só o nome", () => {
    const signature = { authorNameSnapshot: "Admin", authorCrefitoSnapshot: null, authorCrefitoRecorded: true };
    expect(anamnesisSignatureLabel(signature)).toBe("Admin");
    expect(anamnesisCrefitoText(signature)).toBeNull();
  });

  it("versão legada declara a ausência, sem inventar CREFITO", () => {
    const signature = { authorNameSnapshot: "Ana", authorCrefitoSnapshot: null, authorCrefitoRecorded: false };
    expect(anamnesisSignatureLabel(signature)).toBe(`Ana (${LEGACY_CREFITO_NOTE})`);
    expect(anamnesisCrefitoText(signature)).toBe("CREFITO não registrado nesta versão");
  });
});
