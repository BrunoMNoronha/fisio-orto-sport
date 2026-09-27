"use client";

import Link from "next/link";
import { useActionState, useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { AppointmentActionState } from "@/modules/agenda/actions";
import { startsInPast } from "@/modules/agenda/validation";
import { suggestEndTime } from "@/modules/configuracoes/settings";
import { PatientCombobox } from "./patient-combobox";

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

// Relógio arredondado ao minuto, só no cliente: no servidor é null (sem aviso), o que evita
// divergência de hidratação. O valor é relido a cada renderização (ex.: ao editar um campo).
const MINUTE_MS = 60_000;
const noSubscribe = () => () => {};
function useClientMinute() {
  return useSyncExternalStore(
    noSubscribe,
    () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS,
    () => null,
  );
}

// Criação (com paciente e observação) ou reagendamento (paciente fixo; muda horário e profissional).
export function AppointmentForm({
  action,
  initial,
  professionals,
  patientPicker,
  patientName,
  appointmentId,
  suggestedDurationMinutes = null,
  cancelHref,
  submitLabel,
}: {
  action: Action;
  initial: AppointmentFormValues;
  professionals: Option[];
  // Criação: busca de paciente ativo no servidor, com a pré-seleção (se houver).
  patientPicker?: { initial: Option | null };
  patientName?: string;
  appointmentId?: string;
  // Duração sugerida da configuração (issue #63), só na criação: preenche o fim a partir do início
  // enquanto o fim não for editado à mão. Não altera agendamentos existentes nem a regra de conflito.
  suggestedDurationMinutes?: number | null;
  cancelHref: string;
  submitLabel: string;
}) {
  const [values, setValues] = useState(initial);
  // Fim digitado pela pessoa: a sugestão nunca o sobrescreve.
  const [endTouched, setEndTouched] = useState(false);
  const [patient, setPatient] = useState<Option | null>(patientPicker?.initial ?? null);
  const [state, formAction, pending] = useActionState(action, undefined);
  // Aviso de conflito do paciente (MEL-02): só vale para os valores enviados. Editar um campo
  // esconde o aviso, e o próximo envio checa de novo.
  const [editedSinceSubmit, setEditedSinceSubmit] = useState(false);
  const patientConflicts = editedSinceSubmit ? undefined : state?.patientConflicts;
  const errors = state?.fieldErrors;
  const minute = useClientMinute();
  const past = minute !== null && startsInPast(values.date, values.startTime, new Date(minute));

  function field(name: keyof AppointmentFormValues) {
    return {
      name,
      value: values[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const value = event.target.value;
        setEditedSinceSubmit(true);
        if (name === "endTime") setEndTouched(true);
        setValues((current) => {
          const next = { ...current, [name]: value };
          if (name === "startTime" && suggestedDurationMinutes && !endTouched) {
            next.endTime = suggestEndTime(value, suggestedDurationMinutes);
          }
          return next;
        });
      },
    };
  }

  function select(name: "professionalId", label: string, options: Option[], empty: string) {
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
    <form action={formAction} onSubmit={() => setEditedSinceSubmit(false)} className="flex flex-col gap-6" noValidate>
      {appointmentId && <input type="hidden" name="id" value={appointmentId} />}
      {patientConflicts?.length ? (
        <Alert aria-live="polite">
          <AlertDescription className="flex flex-col gap-2">
            <p className="font-medium text-foreground">
              O paciente já tem outro agendamento que se sobrepõe a este horário:
            </p>
            <ul className="list-disc pl-5">
              {patientConflicts.map((conflict) => (
                <li key={conflict.id}>
                  <Link href={`/agenda/${conflict.id}`} className="underline underline-offset-4" target="_blank">
                    {conflict.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p>Se for um encaixe intencional, confirme abaixo; caso contrário, ajuste o horário.</p>
          </AlertDescription>
        </Alert>
      ) : state?.error && !state.patientConflicts && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {patientPicker ? (
          <PatientCombobox
            name="patientId"
            value={patient}
            errors={errors?.patientId}
            onChange={(option) => {
              setEditedSinceSubmit(true);
              setPatient(option);
              setValues((current) => ({ ...current, patientId: option.id }));
            }}
          />
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

      {suggestedDurationMinutes ? (
        <p className="-mt-3 text-xs text-muted-foreground">
          O fim é sugerido com {suggestedDurationMinutes} minutos a partir do início; ajuste se precisar.
        </p>
      ) : null}

      {past && (
        <Alert aria-live="polite">
          <AlertDescription>
            O início escolhido já passou. O agendamento será registrado mesmo assim (lançamento retroativo);
            confira a data e o horário se não era essa a intenção.
          </AlertDescription>
        </Alert>
      )}

      {patientPicker && (
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
        {patientConflicts?.length ? (
          <Button type="submit" name="confirmPatientConflict" value="1" disabled={pending}>
            {pending ? "Salvando…" : "Confirmar mesmo assim"}
          </Button>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : submitLabel}
          </Button>
        )}
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Voltar
        </Link>
      </div>
    </form>
  );
}
