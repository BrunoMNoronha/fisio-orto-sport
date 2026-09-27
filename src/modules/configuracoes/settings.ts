// Catálogo das configurações da clínica (issue #63): tipos, padrões, rótulos e regras puras.
// Sem `server-only`: também é usado pelos formulários no cliente.

export type ClinicSettingsValues = {
  displayName: string | null;
  legalName: string | null;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  agendaDayStartHour: number;
  agendaDayEndHour: number;
  suggestedDurationMinutes: number | null;
  printShowClinicInfo: boolean;
};

export type SettingsField = keyof ClinicSettingsValues;

// Estado lido do banco. `version` 0 significa "nunca salvo": vale o padrão e nada foi gravado.
export type ClinicSettings = ClinicSettingsValues & {
  version: number;
  updatedAt: Date | null;
  updatedByName: string | null;
};

// Padrões = comportamento anterior à issue: sem dados institucionais, grade 07:00–20:00, sem
// duração sugerida e impressões só com a marca do produto.
export const DEFAULT_SETTINGS: ClinicSettingsValues = {
  displayName: null,
  legalName: null,
  cnpj: null,
  phone: null,
  email: null,
  address: null,
  agendaDayStartHour: 7,
  agendaDayEndHour: 20,
  suggestedDurationMinutes: null,
  printShowClinicInfo: false,
};

export const SETTINGS_FIELDS = Object.keys(DEFAULT_SETTINGS) as SettingsField[];

export const SETTINGS_LIMITS = {
  displayName: 120,
  legalName: 160,
  address: 300,
  email: 254,
  minDuration: 5,
  // Mesmo teto de duração da agenda (MAX_DURATION_MINUTES).
  maxDuration: 12 * 60,
} as const;

// Rótulos usados no painel e no resumo da auditoria (só o nome do campo, nunca o valor).
export const SETTINGS_FIELD_LABELS: Record<SettingsField, string> = {
  displayName: "Nome de exibição",
  legalName: "Razão social",
  cnpj: "CNPJ",
  phone: "Telefone",
  email: "E-mail",
  address: "Endereço",
  agendaDayStartHour: "Início da faixa do dia",
  agendaDayEndHour: "Fim da faixa do dia",
  suggestedDurationMinutes: "Duração sugerida",
  printShowClinicInfo: "Identificação nas impressões",
};

export function changedFields(before: ClinicSettingsValues, after: ClinicSettingsValues): SettingsField[] {
  return SETTINGS_FIELDS.filter((field) => before[field] !== after[field]);
}

// Resumo gravado na auditoria: versão nova e nomes dos campos, sem valores (dados da clínica
// podem incluir contatos pessoais).
export function auditDetails(version: number, fields: SettingsField[]): string {
  const names = fields.map((field) => SETTINGS_FIELD_LABELS[field]).join(", ");
  return `Versão ${version}: ${names || "sem alterações"}`.slice(0, 500);
}

export function isValidCnpj(value: string) {
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false;
  const digit = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, weight, index) => acc + Number(value[index]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(value[12]) && digit(13) === Number(value[13]);
}

export function formatCnpj(cnpj: string) {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function maskCnpj(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// Término sugerido para um novo agendamento: início + duração, no mesmo dia. Sem duração, sem
// início válido ou passando da meia-noite, não sugere nada ("").
export function suggestEndTime(startTime: string, durationMinutes: number | null): string {
  if (!durationMinutes || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return "";
  const [hh, mm] = startTime.split(":").map(Number);
  const end = hh * 60 + mm + durationMinutes;
  if (end >= 24 * 60) return "";
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

export type ClinicIdentity = Pick<
  ClinicSettingsValues,
  "displayName" | "legalName" | "cnpj" | "phone" | "email" | "address"
>;

function formatPhoneDigits(phone: string) {
  if (phone.length === 11) return phone.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (phone.length === 10) return phone.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return phone;
}

// Linhas da identificação nas impressões e na prévia do painel: nome em destaque e, abaixo, só as
// linhas que têm algum dado (campos vazios não deixam separador nem linha em branco).
export function identityLines(identity: ClinicIdentity): { title: string | null; lines: string[] } {
  const lines = [
    [identity.legalName, identity.cnpj && `CNPJ ${formatCnpj(identity.cnpj)}`],
    [identity.phone && formatPhoneDigits(identity.phone), identity.email],
    [identity.address],
  ]
    .map((parts) => parts.filter(Boolean).join(" · "))
    .filter(Boolean);
  return { title: identity.displayName || null, lines };
}
