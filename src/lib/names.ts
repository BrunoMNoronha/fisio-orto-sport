// Contrato de nomes (issue #78): nomes são gravados em maiúsculas, normalizados no servidor.
// Sem `server-only`: também é usado pelas ferramentas de terminal (db:admin, seed, normalização).
//
// Campos cobertos (inventário da #78):
// - User.name
// - Patient.fullName e Patient.guardianName
// - ClinicSettings.displayName e ClinicSettings.legalName
// Ficam de fora e-mail, senha, endereço, profissão, parentesco e texto clínico livre. Snapshots
// históricos de autoria e a auditoria nunca são reescritos; novos snapshots já nascem do nome
// normalizado do usuário.
//
// Normalização: Unicode NFC, espaços nas pontas removidos, espaços internos colapsados e maiúsculas
// com as regras do português, preservando acentos ("  João  da Silva " → "JOÃO DA SILVA"). O tamanho
// é validado DEPOIS de normalizar.
export function normalizeName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

// Variante para campos opcionais: vazio vira null.
export function normalizeOptionalName(value: string | null | undefined): string | null {
  const normalized = normalizeName(value ?? "");
  return normalized ? normalized : null;
}
