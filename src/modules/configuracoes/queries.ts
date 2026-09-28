// Leitura das configurações da clínica (issue #63). Sem linha no banco, vale o padrão e nada é
// gravado. Erro de leitura NÃO vira padrão: propaga para a página de erro, para não parecer que a
// clínica não tem configuração. Lido a cada requisição (sem cache entre requisições), então vale
// igual em todas as instâncias logo depois de salvar.
import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/modules/auth/dal";
import { isClosedWeek, parseBusinessHours } from "@/modules/agenda/business-hours";
import { DEFAULT_SETTINGS, type ClinicIdentity, type ClinicSettings } from "./settings";
import { SETTINGS_ID, pickValues } from "./write";

// Uso interno: sem checagem de perfil. Não exporte o resultado inteiro para outros perfis; use
// os recortes abaixo.
const loadSettings = cache(async (): Promise<ClinicSettings> => {
  const row = await prisma.clinicSettings.findUnique({
    where: { id: SETTINGS_ID },
    include: { updatedBy: { select: { name: true } } },
  });
  if (!row) return { ...DEFAULT_SETTINGS, version: 0, updatedAt: null, updatedByName: null };
  return { ...pickValues(row), version: row.version, updatedAt: row.updatedAt, updatedByName: row.updatedBy.name };
});

// Painel: tudo, só para quem pode ler as configurações (Administrador).
export async function getSettingsForPanel(): Promise<ClinicSettings> {
  await requirePermission("configuracoes:ler");
  return loadSettings();
}

// Recortes para os fluxos que cada perfil já acessa. Quem chama já checou a permissão da página.

// Nome exibido na navegação; null = identificação padrão.
export async function getClinicDisplayName(): Promise<string | null> {
  return (await loadSettings()).displayName;
}

export type AgendaPreferences = {
  dayStartHour: number;
  dayEndHour: number;
  suggestedDurationMinutes: number | null;
  defaultView: ClinicSettings["agendaDefaultView"];
  // Expediente em vigor (#78), no formato canônico; null = sem restrição (chave desligada ou vazio).
  businessHours: string | null;
};

function activeBusinessHours(settings: ClinicSettings): string | null {
  if (!settings.businessHoursEnabled) return null;
  const week = parseBusinessHours(settings.businessHours);
  return week && !isClosedWeek(week) ? settings.businessHours : null;
}

export async function getAgendaPreferences(): Promise<AgendaPreferences> {
  const settings = await loadSettings();
  return {
    dayStartHour: settings.agendaDayStartHour,
    dayEndHour: settings.agendaDayEndHour,
    suggestedDurationMinutes: settings.suggestedDurationMinutes,
    defaultView: settings.agendaDefaultView,
    businessHours: activeBusinessHours(settings),
  };
}

// Identificação para os documentos impressos; null quando desligada ou sem nenhum dado.
export async function getPrintIdentity(): Promise<ClinicIdentity | null> {
  const settings = await loadSettings();
  if (!settings.printShowClinicInfo) return null;
  const { displayName, legalName, cnpj, phone, email, address } = settings;
  const identity = { displayName, legalName, cnpj, phone, email, address };
  return Object.values(identity).some(Boolean) ? identity : null;
}
