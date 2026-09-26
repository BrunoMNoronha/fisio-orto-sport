import type { ProfessionalOption } from "@/modules/clinico/session-queries";

// Rótulo do responsável no seletor: nome, CREFITO e, para lançamento retroativo, a marca de inativo.
export function professionalLabel(option: ProfessionalOption) {
  return `${option.name}${option.crefito ? ` (CREFITO ${option.crefito})` : ""}${option.active ? "" : " — inativo"}`;
}
