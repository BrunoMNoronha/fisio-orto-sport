"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { saveSettings, type SettingsActionState } from "@/modules/configuracoes/actions";
import {
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
  suggestedDurationMinutes: string;
  printShowClinicInfo: boolean;
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
    printShowClinicInfo: values.printShowClinicInfo,
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
    printShowClinicInfo: formData.get("printShowClinicInfo") === "on",
  };
}

function sameForm(a: FormValues, b: FormValues) {
  return (Object.keys(a) as (keyof FormValues)[]).every((key) => a[key] === b[key]);
}

const digits = (value: string) => value.replace(/\D/g, "");
const pad = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

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
}: {
  initial: ClinicSettingsValues;
  version: number;
  lastChange: { at: string; by: string | null } | null;
  canManage: boolean;
  timezone: string;
  links: { users: boolean; audit: boolean };
}) {
  const [values, setValues] = useState(() => toForm(initial));
  // Última versão salva: base para "alterações não salvas" e para descartar a edição local.
  const [baseline, setBaseline] = useState(() => toForm(initial));
  const [version, setVersion] = useState(initialVersion);
  const [state, formAction, pending] = useActionState(
    async (prev: SettingsActionState, formData: FormData) => {
      const result = await saveSettings(prev, formData);
      if (result?.ok) {
        setBaseline(fromFormData(formData));
        if (result.version !== undefined) setVersion(result.version);
      }
      return result;
    },
    undefined,
  );
  const errors = state?.fieldErrors;
  const dirty = !sameForm(values, baseline);

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

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="expectedVersion" value={version} />

      <p className="text-xs text-muted-foreground">{lastChangeText}</p>

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
      {state?.ok && !dirty && (
        <Alert aria-live="polite">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Clínica</CardTitle>
          <CardDescription>
            Identificação administrativa, usada na navegação e nas impressões. Todos os campos são opcionais; nada é
            preenchido automaticamente.
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

      <Card>
        <CardHeader>
          <CardTitle>Agenda</CardTitle>
          <CardDescription>
            Preferências de exibição e de preenchimento. Não são horário de funcionamento nem bloqueio de horários, e
            não mudam a regra de conflito.
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
            Faixa mostrada na grade do dia (padrão 07:00–20:00). Agendamentos fora dela continuam aparecendo: a grade se
            amplia para mostrá-los.
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
              Em branco, desligada. Com um valor ({SETTINGS_LIMITS.minDuration} a {SETTINGS_LIMITS.maxDuration}), o
              novo agendamento sugere o fim a partir do início, e dá para ajustar. Não altera agendamentos existentes
              nem a duração das sessões clínicas.
            </p>
            <FieldError
              id="config-suggestedDurationMinutes-erro"
              messages={errors?.suggestedDurationMinutes}
            />
          </div>
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle>Referências</CardTitle>
          <CardDescription>Informações do sistema, só para consulta.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            <span className="text-muted-foreground">Fuso horário da clínica: </span>
            {timezone} (fixo)
          </p>
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
        </CardContent>
      </Card>

      {canManage && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? "Salvando…" : "Salvar configurações"}
          </Button>
          <Button type="button" variant="outline" disabled={pending || !dirty} onClick={() => setValues(baseline)}>
            Descartar alterações
          </Button>
          {dirty && (
            <span className="text-sm text-muted-foreground" aria-live="polite">
              Há alterações não salvas.
            </span>
          )}
        </div>
      )}
    </form>
  );
}
