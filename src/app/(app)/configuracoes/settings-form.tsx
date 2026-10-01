"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { WEEKDAY_LABELS, describeWeek, parseBusinessHours } from "@/modules/agenda/business-hours";
import {
  DEFAULT_RANGE_DAYS,
  MAX_BLOCK_DAYS,
  MAX_DURATION_MINUTES,
  MAX_RANGE_DAYS,
} from "@/modules/agenda/validation";
import { saveSettings, type SettingsActionState } from "@/modules/configuracoes/actions";
import {
  AGENDA_VIEWS,
  AGENDA_VIEW_LABELS,
  DEFAULT_SETTINGS,
  SETTINGS_LIMITS,
  formatCnpj,
  identityLines,
  maskCnpj,
  type ClinicSettingsValues,
} from "@/modules/configuracoes/settings";
import { formatPhone, maskPhone } from "@/modules/pacientes/validation";

// Valores do formulário, como texto (o que a pessoa digita). O servidor normaliza e valida tudo.
type FormValues = {
  displayName: string;
  legalName: string;
  cnpj: string;
  phone: string;
  email: string;
  address: string;
  agendaDayStartHour: string;
  agendaDayEndHour: string;
  maxSimultaneousAppointments: string;
  suggestedDurationMinutes: string;
  agendaDefaultView: string;
  printShowClinicInfo: boolean;
  businessHoursEnabled: boolean;
  // Formato canônico semanal (agenda/business-hours.ts), montado pelo editor abaixo.
  businessHours: string;
};

function toForm(values: ClinicSettingsValues): FormValues {
  return {
    displayName: values.displayName ?? "",
    legalName: values.legalName ?? "",
    cnpj: values.cnpj ? formatCnpj(values.cnpj) : "",
    phone: values.phone ? formatPhone(values.phone) : "",
    email: values.email ?? "",
    address: values.address ?? "",
    agendaDayStartHour: String(values.agendaDayStartHour),
    agendaDayEndHour: String(values.agendaDayEndHour),
    suggestedDurationMinutes: values.suggestedDurationMinutes ? String(values.suggestedDurationMinutes) : "",
    maxSimultaneousAppointments: String(values.maxSimultaneousAppointments),
    agendaDefaultView: values.agendaDefaultView,
    printShowClinicInfo: values.printShowClinicInfo,
    businessHoursEnabled: values.businessHoursEnabled,
    businessHours: values.businessHours,
  };
}

// O que foi enviado (e salvo) vira a nova base, sem depender do estado de uma renderização antiga.
function fromFormData(formData: FormData): FormValues {
  const get = (key: string) => String(formData.get(key) ?? "");
  return {
    displayName: get("displayName"),
    legalName: get("legalName"),
    cnpj: get("cnpj"),
    phone: get("phone"),
    email: get("email"),
    address: get("address"),
    agendaDayStartHour: get("agendaDayStartHour"),
    agendaDayEndHour: get("agendaDayEndHour"),
    suggestedDurationMinutes: get("suggestedDurationMinutes"),
    maxSimultaneousAppointments: get("maxSimultaneousAppointments"),
    agendaDefaultView: get("agendaDefaultView"),
    printShowClinicInfo: formData.get("printShowClinicInfo") === "on",
    businessHoursEnabled: formData.get("businessHoursEnabled") === "on",
    businessHours: get("businessHours"),
  };
}

function sameForm(a: FormValues, b: FormValues) {
  return (Object.keys(a) as (keyof FormValues)[]).every((key) => a[key] === b[key]);
}

const digits = (value: string) => value.replace(/\D/g, "");
const pad = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

// Abas (#78). Um só formulário e um só "Salvar" para Clínica, Agenda e expediente e Impressões: os
// painéis ficam montados (keepMounted), então trocar de aba não perde nada nem salva sozinho, e a
// gravação continua atômica, com a versão lida protegendo contra sobrescrita de qualquer campo.
// Administração e Desenvolvimento ficam fora do formulário.
type TabId = "clinica" | "agenda" | "impressoes" | "administracao" | "desenvolvimento";
const FORM_TABS: TabId[] = ["clinica", "agenda", "impressoes"];
const FIELD_TAB: Record<keyof FormValues, TabId> = {
  displayName: "clinica",
  legalName: "clinica",
  cnpj: "clinica",
  phone: "clinica",
  email: "clinica",
  address: "clinica",
  agendaDayStartHour: "agenda",
  agendaDayEndHour: "agenda",
  suggestedDurationMinutes: "agenda",
  maxSimultaneousAppointments: "agenda",
  agendaDefaultView: "agenda",
  businessHoursEnabled: "agenda",
  businessHours: "agenda",
  printShowClinicInfo: "impressoes",
};
const FIELD_ORDER = Object.keys(FIELD_TAB) as (keyof FormValues)[];

// Editor do expediente: um rascunho por dia, convertido de/para o texto canônico sem validar (o
// servidor valida e aponta o erro). Dias exibidos de segunda a domingo.
type DayDraft = { open: boolean; first: [string, string]; second: [string, string] | null };
const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0];
const DEFAULT_FIRST: [string, string] = ["08:00", "12:00"];
const DEFAULT_SECOND: [string, string] = ["13:00", "18:00"];

function toDrafts(text: string): DayDraft[] {
  const days = text.split(";");
  return Array.from({ length: 7 }, (_, index) => {
    const parts = (days[index] ?? "").split(",").filter(Boolean);
    const pair = (part?: string): [string, string] | null => {
      if (!part) return null;
      const [start = "", end = ""] = part.split("-");
      return [start, end];
    };
    const first = pair(parts[0]);
    return { open: Boolean(first), first: first ?? DEFAULT_FIRST, second: pair(parts[1]) };
  });
}

function fromDrafts(drafts: DayDraft[]): string {
  return drafts
    .map((day) => (day.open ? [day.first, day.second].filter(Boolean).map((pair) => pair!.join("-")).join(",") : ""))
    .join(";");
}

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}

function a11y(id: string, errors?: string[], hint?: boolean) {
  const described = [errors ? `${id}-erro` : null, hint ? `${id}-ajuda` : null].filter(Boolean).join(" ");
  return {
    id,
    "aria-invalid": errors ? true : undefined,
    "aria-describedby": described || undefined,
  } as const;
}

export function SettingsForm({
  initial,
  version: initialVersion,
  lastChange,
  canManage,
  timezone,
  links,
  devPanel = null,
}: {
  initial: ClinicSettingsValues;
  version: number;
  lastChange: { at: string; by: string | null } | null;
  canManage: boolean;
  timezone: string;
  links: { users: boolean; audit: boolean };
  // Ferramentas de desenvolvimento (#73/#78): só vem do servidor com ambiente habilitado e Administrador.
  devPanel?: React.ReactNode;
}) {
  const [values, setValues] = useState(() => toForm(initial));
  // Última versão salva: base para "alterações não salvas" e para descartar a edição local.
  const [baseline, setBaseline] = useState(() => toForm(initial));
  const [version, setVersion] = useState(initialVersion);
  const [tab, setTab] = useState<TabId>("clinica");
  const [state, formAction, pending] = useActionState(
    async (prev: SettingsActionState, formData: FormData) => {
      const result = await saveSettings(prev, formData);
      if (result?.ok) {
        setBaseline(fromFormData(formData));
        if (result.version !== undefined) setVersion(result.version);
      }
      // Erro em aba não visível: abre a primeira aba com erro e leva o foco ao campo (#78).
      const firstError = FIELD_ORDER.find((field) => result?.fieldErrors?.[field]?.length);
      if (firstError) {
        setTab(FIELD_TAB[firstError]);
        requestAnimationFrame(() => document.getElementById(`config-${firstError}`)?.focus());
      }
      return result;
    },
    undefined,
  );
  const errors = state?.fieldErrors;
  const dirty = !sameForm(values, baseline);
  const tabHasError = (id: TabId) => FIELD_ORDER.some((field) => FIELD_TAB[field] === id && errors?.[field]?.length);
  const tabIsDirty = (id: TabId) => FIELD_ORDER.some((field) => FIELD_TAB[field] === id && values[field] !== baseline[field]);

  // Aviso do navegador ao sair com alterações não salvas.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function set<K extends keyof FormValues>(name: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  const drafts = toDrafts(values.businessHours);
  function setDay(weekday: number, change: (day: DayDraft) => DayDraft) {
    set("businessHours", fromDrafts(drafts.map((day, index) => (index === weekday ? change(day) : day))));
  }
  const week = parseBusinessHours(values.businessHours);

  function text(
    name: "displayName" | "legalName" | "email" | "address",
    label: string,
    options: { max: number; type?: string; hint?: string; autoComplete?: string },
  ) {
    const id = `config-${name}`;
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          {...a11y(id, errors?.[name], Boolean(options.hint))}
          name={name}
          type={options.type ?? "text"}
          value={values[name]}
          maxLength={options.max}
          autoComplete={options.autoComplete ?? "off"}
          disabled={!canManage}
          onChange={(event) => set(name, event.target.value)}
        />
        {options.hint && (
          <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
            {options.hint}
          </p>
        )}
        <FieldError id={`${id}-erro`} messages={errors?.[name]} />
      </div>
    );
  }

  function timeInput(id: string, label: string, value: string, onChange: (value: string) => void) {
    return (
      <Input
        id={id}
        aria-label={label}
        type="time"
        step={300}
        value={value}
        disabled={!canManage}
        onChange={(event) => onChange(event.target.value)}
        className="w-28"
      />
    );
  }

  function tabLabel(id: TabId, label: string) {
    const hasError = tabHasError(id);
    const changed = FORM_TABS.includes(id) && tabIsDirty(id);
    return (
      <TabsTab value={id}>
        {label}
        {hasError ? (
          <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
        ) : changed ? (
          <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
        ) : null}
        {hasError && <span className="sr-only"> (com erros)</span>}
        {!hasError && changed && <span className="sr-only"> (alterada, não salva)</span>}
      </TabsTab>
    );
  }

  const preview = identityLines({
    displayName: values.displayName.trim() || null,
    legalName: values.legalName.trim() || null,
    cnpj: digits(values.cnpj).length === 14 ? digits(values.cnpj) : null,
    phone: /^\d{10,11}$/.test(digits(values.phone)) ? digits(values.phone) : null,
    email: values.email.trim() || null,
    address: values.address.trim() || null,
  });
  const hasIdentity = Boolean(preview.title || preview.lines.length);
  const lastChangeText = lastChange
    ? `Última alteração em ${new Date(lastChange.at).toLocaleString("pt-BR", {
        timeZone: timezone,
        dateStyle: "short",
        timeStyle: "short",
      })}${lastChange.by ? ` por ${lastChange.by}` : ""} · versão ${version}.`
    : "Ainda não salvas: valem os padrões do sistema.";
  const onFormTab = FORM_TABS.includes(tab);

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
      <TabsList aria-label="Seções das configurações">
        {tabLabel("clinica", "Clínica")}
        {tabLabel("agenda", "Agenda e expediente")}
        {tabLabel("impressoes", "Impressões")}
        {tabLabel("administracao", "Administração")}
        {devPanel ? tabLabel("desenvolvimento", "Desenvolvimento") : null}
      </TabsList>

      <form action={formAction} className="flex flex-col gap-6" noValidate>
        <input type="hidden" name="expectedVersion" value={version} />
        <input type="hidden" name="businessHours" value={values.businessHours} />

        {onFormTab && <p className="text-xs text-muted-foreground">{lastChangeText}</p>}

        {state?.error && (
          <Alert variant="destructive" aria-live="polite">
            <AlertDescription className="flex flex-wrap items-center gap-3">
              {state.error}
              {state.conflict && (
                <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
                  Recarregar
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        {state?.ok && !dirty && onFormTab && (
          <Alert aria-live="polite">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        <TabsPanel value="clinica" keepMounted>
          <Card>
            <CardHeader>
              <CardTitle>Clínica</CardTitle>
              <CardDescription>
                Identificação administrativa, usada na navegação e nas impressões. Todos os campos são opcionais; nada é
                preenchido automaticamente. Nomes são gravados em maiúsculas.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                {text("displayName", "Nome de exibição", {
                  max: SETTINGS_LIMITS.displayName,
                  hint: "Aparece abaixo da marca na barra lateral e no cabeçalho das impressões. Não muda a marca do sistema.",
                  autoComplete: "organization",
                })}
              </div>
              <div className="sm:col-span-2">
                {text("legalName", "Razão social", { max: SETTINGS_LIMITS.legalName })}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="config-cnpj">CNPJ</Label>
                <Input
                  {...a11y("config-cnpj", errors?.cnpj)}
                  name="cnpj"
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  value={values.cnpj}
                  disabled={!canManage}
                  onChange={(event) => set("cnpj", maskCnpj(event.target.value))}
                />
                <FieldError id="config-cnpj-erro" messages={errors?.cnpj} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="config-phone">Telefone</Label>
                <Input
                  {...a11y("config-phone", errors?.phone)}
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="(00) 00000-0000"
                  value={values.phone}
                  disabled={!canManage}
                  onChange={(event) => set("phone", maskPhone(event.target.value))}
                />
                <FieldError id="config-phone-erro" messages={errors?.phone} />
              </div>
              <div className="sm:col-span-2">
                {text("email", "E-mail", { max: SETTINGS_LIMITS.email, type: "email" })}
              </div>
              <div className="sm:col-span-2">
                {text("address", "Endereço", { max: SETTINGS_LIMITS.address, autoComplete: "street-address" })}
              </div>
            </CardContent>
          </Card>
        </TabsPanel>

        <TabsPanel value="agenda" keepMounted>
          <Card>
            <CardHeader>
              <CardTitle>Grade da agenda</CardTitle>
              <CardDescription>
                Preferências de exibição, preenchimento e capacidade. A faixa do dia é só visual: não é o expediente (abaixo) nem
                bloqueio de horários, e não muda a regra de conflito.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="config-agendaDayStartHour">Início da faixa do dia</Label>
                <NativeSelect
                  {...a11y("config-agendaDayStartHour", errors?.agendaDayStartHour)}
                  name="agendaDayStartHour"
                  value={values.agendaDayStartHour}
                  disabled={!canManage}
                  onChange={(event) => set("agendaDayStartHour", event.target.value)}
                  className="w-full"
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <NativeSelectOption key={hour} value={String(hour)}>
                      {pad(hour)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError id="config-agendaDayStartHour-erro" messages={errors?.agendaDayStartHour} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="config-agendaDayEndHour">Fim da faixa do dia</Label>
                <NativeSelect
                  {...a11y("config-agendaDayEndHour", errors?.agendaDayEndHour)}
                  name="agendaDayEndHour"
                  value={values.agendaDayEndHour}
                  disabled={!canManage}
                  onChange={(event) => set("agendaDayEndHour", event.target.value)}
                  className="w-full"
                >
                  {Array.from({ length: 24 }, (_, index) => index + 1).map((hour) => (
                    <NativeSelectOption key={hour} value={String(hour)}>
                      {hour === 24 ? "24:00 (meia-noite)" : pad(hour)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError id="config-agendaDayEndHour-erro" messages={errors?.agendaDayEndHour} />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Faixa mostrada na grade do dia (padrão {pad(DEFAULT_SETTINGS.agendaDayStartHour)}–
                {pad(DEFAULT_SETTINGS.agendaDayEndHour)}). Agendamentos fora dela continuam aparecendo: a grade se amplia
                para mostrá-los.
              </p>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="config-suggestedDurationMinutes">Duração sugerida (minutos)</Label>
                <Input
                  {...a11y("config-suggestedDurationMinutes", errors?.suggestedDurationMinutes, true)}
                  name="suggestedDurationMinutes"
                  inputMode="numeric"
                  placeholder="Desligada"
                  value={values.suggestedDurationMinutes}
                  disabled={!canManage}
                  onChange={(event) => set("suggestedDurationMinutes", digits(event.target.value).slice(0, 3))}
                  className="sm:max-w-40"
                />
                <p id="config-suggestedDurationMinutes-ajuda" className="text-xs text-muted-foreground">
                  Padrão: desligada (em branco). Com um valor ({SETTINGS_LIMITS.minDuration} a{" "}
                  {SETTINGS_LIMITS.maxDuration}, o teto técnico do agendamento), o novo agendamento sugere o fim a partir
                  do início, e dá para ajustar. Não altera agendamentos existentes nem a duração das sessões clínicas.
                </p>
                <FieldError
                  id="config-suggestedDurationMinutes-erro"
                  messages={errors?.suggestedDurationMinutes}
                />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="config-maxSimultaneousAppointments">Agendamentos simultâneos por fisioterapeuta</Label>
                <Input
                  {...a11y("config-maxSimultaneousAppointments", errors?.maxSimultaneousAppointments, true)}
                  name="maxSimultaneousAppointments"
                  type="number" min={1} max={2147483647} step={1}
                  value={values.maxSimultaneousAppointments}
                  disabled={!canManage}
                  onChange={(event) => set("maxSimultaneousAppointments", event.target.value)}
                />
                <p id="config-maxSimultaneousAppointments-ajuda" className="text-xs text-muted-foreground">
                  Padrão: 3. Vale separadamente para cada fisioterapeuta durante todo o atendimento.
                  Reduzir o limite preserva os agendamentos existentes.
                </p>
                <FieldError id="config-maxSimultaneousAppointments-erro" messages={errors?.maxSimultaneousAppointments} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="config-agendaDefaultView">Visão inicial da agenda</Label>
                <NativeSelect
                  {...a11y("config-agendaDefaultView", errors?.agendaDefaultView, true)}
                  name="agendaDefaultView"
                  value={values.agendaDefaultView}
                  disabled={!canManage}
                  onChange={(event) => set("agendaDefaultView", event.target.value)}
                  className="w-full sm:max-w-40"
                >
                  {AGENDA_VIEWS.map((view) => (
                    <NativeSelectOption key={view} value={view}>
                      {AGENDA_VIEW_LABELS[view]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <p id="config-agendaDefaultView-ajuda" className="text-xs text-muted-foreground">
                  Padrão: {AGENDA_VIEW_LABELS[DEFAULT_SETTINGS.agendaDefaultView]}. Visão que abre ao entrar na agenda
                  pelo menu, para todos os perfis. Links que já indicam a visão continuam valendo, e cada pessoa pode
                  trocar de visão a qualquer momento.
                </p>
                <FieldError id="config-agendaDefaultView-erro" messages={errors?.agendaDefaultView} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Expediente</CardTitle>
              <CardDescription>
                Dias e horários de atendimento da clínica, com até dois intervalos por dia (a pausa fica entre eles).
                Aplicado, restringe novos agendamentos e reagendamentos; os já salvos não mudam e, se ficarem fora,
                aparecem sinalizados. Feriados e ausências: use os bloqueios da agenda.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2" aria-describedby="config-businessHours-resumo config-businessHours-erro">
                <legend className="sr-only">Expediente por dia da semana</legend>
                {DISPLAY_DAYS.map((weekday) => {
                  const day = drafts[weekday];
                  const prefix = `config-expediente-${weekday}`;
                  const name = WEEKDAY_LABELS[weekday];
                  return (
                    <div key={weekday} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2">
                      <label className="flex w-28 items-center gap-2 text-sm font-medium">
                        <input
                          id={weekday === 1 ? "config-businessHours" : undefined}
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={day.open}
                          disabled={!canManage}
                          onChange={(event) => setDay(weekday, (d) => ({ ...d, open: event.target.checked }))}
                        />
                        {name}
                      </label>
                      {day.open ? (
                        <>
                          <span className="flex items-center gap-1 text-sm">
                            {timeInput(`${prefix}-1-inicio`, `${name}: início do 1º intervalo`, day.first[0], (v) =>
                              setDay(weekday, (d) => ({ ...d, first: [v, d.first[1]] })),
                            )}
                            <span aria-hidden="true">–</span>
                            {timeInput(`${prefix}-1-fim`, `${name}: fim do 1º intervalo`, day.first[1], (v) =>
                              setDay(weekday, (d) => ({ ...d, first: [d.first[0], v] })),
                            )}
                          </span>
                          {day.second ? (
                            <span className="flex items-center gap-1 text-sm">
                              {timeInput(`${prefix}-2-inicio`, `${name}: início do 2º intervalo`, day.second[0], (v) =>
                                setDay(weekday, (d) => ({ ...d, second: [v, d.second![1]] })),
                              )}
                              <span aria-hidden="true">–</span>
                              {timeInput(`${prefix}-2-fim`, `${name}: fim do 2º intervalo`, day.second[1], (v) =>
                                setDay(weekday, (d) => ({ ...d, second: [d.second![0], v] })),
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={!canManage}
                                onClick={() => setDay(weekday, (d) => ({ ...d, second: null }))}
                              >
                                Sem pausa<span className="sr-only"> ({name})</span>
                              </Button>
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={!canManage}
                              onClick={() => setDay(weekday, (d) => ({ ...d, second: DEFAULT_SECOND }))}
                            >
                              Adicionar pausa<span className="sr-only"> ({name})</span>
                            </Button>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">Fechado</span>
                      )}
                    </div>
                  );
                })}
              </fieldset>
              <p id="config-businessHours-resumo" className="text-xs text-muted-foreground" aria-live="polite">
                {week ? `Resumo: ${describeWeek(week)}` : "Confira os horários: há um intervalo incompleto ou fora de ordem."}
              </p>
              <FieldError id="config-businessHours-erro" messages={errors?.businessHours} />

              <div className="flex items-start gap-3">
                <input
                  id="config-businessHoursEnabled"
                  name="businessHoursEnabled"
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={values.businessHoursEnabled}
                  disabled={!canManage}
                  onChange={(event) => set("businessHoursEnabled", event.target.checked)}
                  aria-describedby="config-businessHoursEnabled-ajuda config-businessHoursEnabled-erro"
                  aria-invalid={errors?.businessHoursEnabled ? true : undefined}
                />
                <div className="grid gap-1">
                  <Label htmlFor="config-businessHoursEnabled">Aplicar o expediente à agenda</Label>
                  <p id="config-businessHoursEnabled-ajuda" className="text-xs text-muted-foreground">
                    Padrão: desligado (sem restrição). Ligado, o formulário de agendamento só oferece horários dentro do
                    expediente, e o servidor recusa o que estiver fora.
                  </p>
                  <FieldError id="config-businessHoursEnabled-erro" messages={errors?.businessHoursEnabled} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsPanel>

        <TabsPanel value="impressoes" keepMounted>
          <Card>
            <CardHeader>
              <CardTitle>Impressões</CardTitle>
              <CardDescription>
                Termo de consentimento, ficha de anamnese e cartão de frequência. Reimpressões usam a identificação
                vigente, não a da época do documento.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <input
                  id="config-printShowClinicInfo"
                  name="printShowClinicInfo"
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={values.printShowClinicInfo}
                  disabled={!canManage}
                  onChange={(event) => set("printShowClinicInfo", event.target.checked)}
                  aria-describedby="config-printShowClinicInfo-ajuda"
                />
                <div className="grid gap-1">
                  <Label htmlFor="config-printShowClinicInfo">Mostrar a identificação da clínica nas impressões</Label>
                  <p id="config-printShowClinicInfo-ajuda" className="text-xs text-muted-foreground">
                    Campos vazios são omitidos. O cartão de frequência mostra só o nome e o telefone.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border bg-white p-4 text-center text-black" aria-label="Prévia do cabeçalho">
                <p className="mb-2 text-xs text-muted-foreground">Prévia do cabeçalho</p>
                {values.printShowClinicInfo && hasIdentity ? (
                  <div className="grid gap-0.5 text-xs leading-tight">
                    {preview.title && <p className="text-sm font-semibold">{preview.title}</p>}
                    {preview.lines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {values.printShowClinicInfo
                      ? "Nenhum dado da clínica preenchido: o cabeçalho fica só com a marca."
                      : "Desligado: o cabeçalho fica só com a marca, como antes."}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsPanel>

        {canManage && (onFormTab || dirty) && (
          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
            <Button type="submit" disabled={pending || !dirty}>
              {pending ? "Salvando…" : "Salvar configurações"}
            </Button>
            <Button type="button" variant="outline" disabled={pending || !dirty} onClick={() => setValues(baseline)}>
              Descartar alterações
            </Button>
            {dirty && (
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {onFormTab
                  ? "Há alterações não salvas (o salvamento inclui todas as abas)."
                  : "Há alterações não salvas em outras abas."}
              </span>
            )}
          </div>
        )}
      </form>

      <TabsPanel value="administracao">
        <Card>
          <CardHeader>
            <CardTitle>Administração</CardTitle>
            <CardDescription>
              Acesso à gestão de usuários e à auditoria, e regras fixas do sistema, só para consulta.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div className="flex flex-wrap gap-4">
              {links.users && (
                <Link href="/usuarios" className="underline underline-offset-4">
                  Gestão de usuários
                </Link>
              )}
              {links.audit && (
                <Link href="/usuarios/auditoria" className="underline underline-offset-4">
                  Auditoria
                </Link>
              )}
            </div>
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">Fuso horário da clínica</dt>
              <dd>{timezone}</dd>
              <dt className="text-muted-foreground">Duração máxima de um agendamento</dt>
              <dd>{MAX_DURATION_MINUTES / 60} horas, no mesmo dia</dd>
              <dt className="text-muted-foreground">Período da visão Lista</dt>
              <dd>
                {DEFAULT_RANGE_DAYS} dias sem datas escolhidas; até {MAX_RANGE_DAYS} dias por consulta
              </dd>
              <dt className="text-muted-foreground">Duração máxima de um bloqueio</dt>
              <dd>{MAX_BLOCK_DAYS} dias</dd>
            </dl>
          </CardContent>
        </Card>
      </TabsPanel>

      {devPanel ? <TabsPanel value="desenvolvimento">{devPanel}</TabsPanel> : null}
    </Tabs>
  );
}
