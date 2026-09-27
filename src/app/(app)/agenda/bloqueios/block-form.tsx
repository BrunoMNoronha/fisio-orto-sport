"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { createScheduleBlock } from "@/modules/agenda/actions";

type Option = { id: string; label: string };
export type BlockFormValues = {
  professionalId: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

function a11y(id: string, errors?: string[]) {
  return {
    id,
    "aria-invalid": errors ? true : undefined,
    "aria-describedby": errors ? `${id}-erro` : undefined,
  } as const;
}

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}

// Bloqueio de horário (MEL-02): intervalo [início, fim), pode durar vários dias. Recusado se houver
// agendamento ativo no período; a lista mostra quais tratar antes.
export function BlockForm({ initial, professionals }: { initial: BlockFormValues; professionals: Option[] }) {
  const [state, formAction, pending] = useActionState(createScheduleBlock, undefined);
  const errors = state?.fieldErrors;
  // Controlado: o React limpa campos não controlados após a action, e um erro não deve apagar o período.
  const [values, setValues] = useState(initial);
  const bind = (name: keyof BlockFormValues) => ({
    name,
    value: values[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues((current) => ({ ...current, [name]: event.target.value })),
  });
  const [reason, setReason] = useState("");

  function input(name: keyof Omit<BlockFormValues, "professionalId">, label: string, type: string) {
    const id = `bloqueio-${name}`;
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Input {...a11y(id, errors?.[name])} {...bind(name)} type={type} required />
        <FieldError id={`${id}-erro`} messages={errors?.[name]} />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {state?.error && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription className="flex flex-col gap-2">
            <p>{state.error}</p>
            {state.conflicts?.length ? (
              <ul className="list-disc pl-5">
                {state.conflicts.map((conflict) => (
                  <li key={conflict.id}>
                    <Link href={`/agenda/${conflict.id}`} className="underline underline-offset-4">
                      {conflict.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="bloqueio-professionalId">Profissional *</Label>
        <NativeSelect
          {...a11y("bloqueio-professionalId", errors?.professionalId)}
          {...bind("professionalId")}
          required
          className="w-full"
        >
          <NativeSelectOption value="">Selecione o profissional</NativeSelectOption>
          {professionals.map((option) => (
            <NativeSelectOption key={option.id} value={option.id}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldError id="bloqueio-professionalId-erro" messages={errors?.professionalId} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {input("startDate", "Data de início *", "date")}
        {input("startTime", "Hora de início *", "time")}
        {input("endDate", "Data de fim *", "date")}
        {input("endTime", "Hora de fim *", "time")}
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        O horário final não entra no bloqueio: bloquear de 08:00 a 12:00 permite agendar a partir das 12:00. Para
        um dia inteiro, use 00:00 até 00:00 do dia seguinte.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bloqueio-reason">Motivo (opcional)</Label>
        <Input
          {...a11y("bloqueio-reason", errors?.reason)}
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">Ex.: férias, curso. Não registre informações clínicas.</p>
        <FieldError id="bloqueio-reason-erro" messages={errors?.reason} />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Bloquear horário"}
        </Button>
        <Link href="/agenda/bloqueios" className={buttonVariants({ variant: "outline" })}>
          Voltar
        </Link>
      </div>
    </form>
  );
}
