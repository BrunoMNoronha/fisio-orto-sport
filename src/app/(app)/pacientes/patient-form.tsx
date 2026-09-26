"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { PatientActionState } from "@/modules/pacientes/actions";
import { OCCUPATION_MAX, SEXES, SEX_LABELS, isMinor, maskCpf, maskPhone } from "@/modules/pacientes/validation";

type Action = (prev: PatientActionState, formData: FormData) => Promise<PatientActionState>;

export type PatientFormValues = {
  fullName: string;
  birthDate: string;
  sex: string;
  occupation: string;
  cpf: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  guardianName: string;
  guardianPhone: string;
  guardianRelationship: string;
};

export const EMPTY_PATIENT: PatientFormValues = {
  fullName: "",
  birthDate: "",
  sex: "",
  occupation: "",
  cpf: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  guardianName: "",
  guardianPhone: "",
  guardianRelationship: "",
};

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}

function a11y(id: string, errors?: string[]) {
  return {
    id,
    "aria-invalid": errors ? true : undefined,
    "aria-describedby": errors ? `${id}-erro` : undefined,
  } as const;
}

function birthDateIsMinor(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && isMinor(date);
}

// O servidor guarda só os dígitos; a máscara é apenas de exibição.
const MASKS: Partial<Record<keyof PatientFormValues, (value: string) => string>> = {
  cpf: maskCpf,
  phone: maskPhone,
  guardianPhone: maskPhone,
};

// Campos controlados: os valores sobrevivem ao reset do formulário após uma validação com erro.
export function PatientForm({
  action,
  initial = EMPTY_PATIENT,
  patientId,
  cancelHref,
  submitLabel,
}: {
  action: Action;
  initial?: PatientFormValues;
  patientId?: string;
  cancelHref: string;
  submitLabel: string;
}) {
  const [values, setValues] = useState(initial);
  const [state, formAction, pending] = useActionState(action, undefined);
  const errors = state?.fieldErrors;
  const minor = birthDateIsMinor(values.birthDate);

  function field(name: keyof PatientFormValues) {
    const mask = MASKS[name];
    return {
      name,
      value: values[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const value = mask ? mask(event.target.value) : event.target.value;
        setValues((current) => ({ ...current, [name]: value }));
      },
    };
  }

  function text(name: keyof PatientFormValues, label: string, props: React.ComponentProps<"input"> = {}) {
    const id = `paciente-${name}`;
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Input {...a11y(id, errors?.[name])} {...field(name)} autoComplete="off" {...props} />
        <FieldError id={`${id}-erro`} messages={errors?.[name]} />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {patientId && <input type="hidden" name="id" value={patientId} />}
      {state?.error && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-base font-medium">Dados pessoais</legend>
        <div className="sm:col-span-2">{text("fullName", "Nome completo *", { required: true, maxLength: 120 })}</div>
        {text("birthDate", "Data de nascimento *", { type: "date", required: true })}
        <div className="flex flex-col gap-2">
          <Label htmlFor="paciente-sex">Sexo *</Label>
          <NativeSelect {...a11y("paciente-sex", errors?.sex)} {...field("sex")} required className="w-full">
            <NativeSelectOption value="" disabled>
              Selecione
            </NativeSelectOption>
            {SEXES.map((sex) => (
              <NativeSelectOption key={sex} value={sex}>
                {SEX_LABELS[sex]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError id="paciente-sex-erro" messages={errors?.sex} />
        </div>
        {text("cpf", "CPF (opcional)", { inputMode: "numeric", placeholder: "000.000.000-00", maxLength: 14 })}
        {text("occupation", "Profissão (opcional)", { maxLength: OCCUPATION_MAX })}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-base font-medium">Contato</legend>
        {text("phone", "Telefone *", { type: "tel", inputMode: "tel", required: true, placeholder: "(00) 00000-0000", maxLength: 15 })}
        {text("email", "E-mail (opcional)", { type: "email" })}
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="paciente-address">Endereço (opcional)</Label>
          <Textarea
            {...a11y("paciente-address", errors?.address)}
            {...field("address")}
            maxLength={300}
            rows={2}
          />
          <FieldError id="paciente-address-erro" messages={errors?.address} />
        </div>
      </fieldset>

      {(minor || errors?.guardianName || errors?.guardianPhone) && (
        <fieldset className="grid gap-4 rounded-xl border bg-card shadow-xs p-4 sm:grid-cols-2">
          <legend className="px-1 text-base font-medium">Responsável legal</legend>
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Paciente menor de 18 anos: informe o nome e o telefone do responsável.
          </p>
          {text("guardianName", "Nome do responsável *", { required: true, maxLength: 120 })}
          {text("guardianPhone", "Telefone do responsável *", {
            type: "tel",
            inputMode: "tel",
            required: true,
            placeholder: "(00) 00000-0000",
            maxLength: 15,
          })}
          {text("guardianRelationship", "Parentesco ou relação (opcional)", { maxLength: 60 })}
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="paciente-notes">Observações administrativas (opcional)</Label>
        <Textarea
          {...a11y("paciente-notes", errors?.notes)}
          {...field("notes")}
          maxLength={1000}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">Não registre informações clínicas aqui.</p>
        <FieldError id="paciente-notes-erro" messages={errors?.notes} />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : submitLabel}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
