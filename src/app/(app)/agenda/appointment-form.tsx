"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { AppointmentActionState } from "@/modules/agenda/actions";

type Action = (prev: AppointmentActionState, formData: FormData) => Promise<AppointmentActionState>;
type Option = { id: string; label: string };

export type AppointmentFormValues = {
  patientId: string;
  professionalId: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
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


// Criação (com paciente e observação) ou reagendamento (paciente fixo; muda horário e profissional).
export function AppointmentForm({
  action,
  initial,
  professionals,
  patients,
  patientName,
  appointmentId,
  cancelHref,
  submitLabel,
}: {
  action: Action;
  initial: AppointmentFormValues;
  professionals: Option[];
  patients?: Option[];
  patientName?: string;
  appointmentId?: string;
  cancelHref: string;
  submitLabel: string;
}) {
  const [values, setValues] = useState(initial);
  const [state, formAction, pending] = useActionState(action, undefined);
  const errors = state?.fieldErrors;

  function field(name: keyof AppointmentFormValues) {
    return {
      name,
      value: values[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setValues((current) => ({ ...current, [name]: event.target.value })),
    };
  }

  function select(name: "patientId" | "professionalId", label: string, options: Option[], empty: string) {
    const id = `agendamento-${name}`;
    return (
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Label htmlFor={id}>{label}</Label>
        <NativeSelect {...a11y(id, errors?.[name])} {...field(name)} required className="w-full">
          <NativeSelectOption value="">{empty}</NativeSelectOption>
          {options.map((option) => (
            <NativeSelectOption key={option.id} value={option.id}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldError id={`${id}-erro`} messages={errors?.[name]} />
      </div>
    );
  }

  function input(name: "date" | "startTime" | "endTime", label: string, type: string) {
    const id = `agendamento-${name}`;
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Input {...a11y(id, errors?.[name])} {...field(name)} type={type} required />
        <FieldError id={`${id}-erro`} messages={errors?.[name]} />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {appointmentId && <input type="hidden" name="id" value={appointmentId} />}
      {state?.error && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {patients ? (
          select("patientId", "Paciente *", patients, "Selecione um paciente ativo")
        ) : (
          <p className="text-sm sm:col-span-3">
            <span className="text-muted-foreground">Paciente: </span>
            {patientName}
          </p>
        )}
        {select("professionalId", "Profissional *", professionals, "Selecione o profissional")}
        {input("date", "Data *", "date")}
        {input("startTime", "Início *", "time")}
        {input("endTime", "Fim *", "time")}
      </div>

      {patients && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="agendamento-notes">Observação administrativa (opcional)</Label>
          <Textarea
            {...a11y("agendamento-notes", errors?.notes)}
            {...field("notes")}
            maxLength={500}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">Não registre informações clínicas aqui.</p>
          <FieldError id="agendamento-notes-erro" messages={errors?.notes} />
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : submitLabel}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Voltar
        </Link>
      </div>
    </form>
  );
}
