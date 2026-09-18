"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { setPatientStatus } from "@/modules/pacientes/actions";
import type { PatientStatusValue } from "@/modules/pacientes/validation";

export function ToggleStatusButton({ id, status }: { id: string; status: PatientStatusValue }) {
  const [state, formAction, pending] = useActionState(setPatientStatus, undefined);
  const next = status === "ATIVO" ? "INATIVO" : "ATIVO";

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
      <Button type="submit" variant={next === "INATIVO" ? "outline" : "default"} disabled={pending}>
        {pending ? "Salvando…" : next === "INATIVO" ? "Inativar" : "Reativar"}
      </Button>
      <p aria-live="polite" className={state?.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {state?.error ?? state?.message}
      </p>
    </form>
  );
}
