"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { setAttendance } from "@/modules/agenda/actions";
import {
  APPOINTMENT_ATTENDANCES,
  APPOINTMENT_ATTENDANCE_LABELS,
  type AppointmentAttendanceValue,
} from "@/modules/agenda/validation";

// Presença (MEL-01): marca, corrige ou remove. Só registro, sem cobrança nem bloqueio.
// O servidor revalida horário iniciado, status e atendimento vinculado.
export function AttendanceForm({ id, current }: { id: string; current: AppointmentAttendanceValue | null }) {
  const [state, formAction, pending] = useActionState(setAttendance, undefined);
  const [value, setValue] = useState<string>(current ?? "");
  const error = state?.error ?? state?.fieldErrors?.attendance?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border bg-card shadow-xs p-4">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-col gap-2">
          <Label htmlFor="presenca">Presença</Label>
          <NativeSelect
            id="presenca"
            name="attendance"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "presenca-erro" : undefined}
          >
            <NativeSelectOption value="">Não marcada</NativeSelectOption>
            {APPOINTMENT_ATTENDANCES.map((option) => (
              <NativeSelectOption key={option} value={option}>
                {APPOINTMENT_ATTENDANCE_LABELS[option]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline" disabled={pending || value === (current ?? "")}>
          {pending ? "Salvando…" : "Salvar presença"}
        </Button>
      </div>
      {error && (
        <p id="presenca-erro" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {state?.message}
      </p>
    </form>
  );
}
