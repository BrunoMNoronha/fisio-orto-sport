"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelAppointment } from "@/modules/agenda/actions";

export function CancelAppointmentForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(cancelAppointment, undefined);
  const reasonError = state?.fieldErrors?.reason?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-4">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="cancelar-motivo">Motivo do cancelamento (opcional)</Label>
        <Input
          id="cancelar-motivo"
          name="reason"
          maxLength={500}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? "cancelar-motivo-erro" : undefined}
        />
        {reasonError && (
          <p id="cancelar-motivo-erro" className="text-sm text-destructive">
            {reasonError}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "Cancelando…" : "Cancelar agendamento"}
        </Button>
        <p aria-live="polite" className={state?.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {state?.error ?? state?.message}
        </p>
      </div>
    </form>
  );
}
