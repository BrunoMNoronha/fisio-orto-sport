// Assinatura da anamnese (MEL-03, #46; decisões de 27/09/2026). Só o que foi gravado na versão:
// nunca o cadastro atual do autor. Versões anteriores à MEL-03 não têm CREFITO registrado (sem
// backfill) e dizem isso explicitamente; em versão nova, CREFITO nulo é autor sem CREFITO
// (ex.: Administrador), exibido só com o nome, como nos demais registros clínicos.
export const LEGACY_CREFITO_NOTE = "CREFITO não registrado nesta versão";

export type AnamnesisSignature = {
  authorNameSnapshot: string;
  authorCrefitoSnapshot: string | null;
  authorCrefitoRecorded: boolean;
};

// Complemento do nome: "CREFITO 123-F", a nota do legado ou nada.
export function anamnesisCrefitoText(signature: AnamnesisSignature) {
  if (!signature.authorCrefitoRecorded) return LEGACY_CREFITO_NOTE;
  return signature.authorCrefitoSnapshot ? `CREFITO ${signature.authorCrefitoSnapshot}` : null;
}

export function anamnesisSignatureLabel(signature: AnamnesisSignature) {
  const crefito = anamnesisCrefitoText(signature);
  return crefito ? `${signature.authorNameSnapshot} (${crefito})` : signature.authorNameSnapshot;
}
