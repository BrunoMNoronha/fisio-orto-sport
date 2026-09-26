"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { setPatientStatus, type PatientActionState } from "@/modules/pacientes/actions";
import type { PatientStatusValue } from "@/modules/pacientes/validation";

// Inativar pede confirmação num diálogo; reativar é direto (só desfaz a inativação).
export function ToggleStatusButton({
  id,
  status,
  patientName,
}: {
  id: string;
  status: PatientStatusValue;
  patientName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: PatientActionState, formData: FormData) => {
    const result = await setPatientStatus(prev, formData);
    if (result?.ok) setOpen(false);
    return result;
  }, undefined);
  const next = status === "ATIVO" ? "INATIVO" : "ATIVO";

  const fields = (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
    </>
  );
  const feedback = (
    <p aria-live="polite" className={state?.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
      {state?.error ?? state?.message}
    </p>
  );

  if (next === "ATIVO") {
    return (
      <form action={formAction} className="flex flex-col items-start gap-1">
        {fields}
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Reativar"}
        </Button>
        {feedback}
      </form>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="outline" />}>Inativar</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inativar paciente?</DialogTitle>
            <DialogDescription>
              {patientName} deixará de aparecer entre os pacientes ativos e não poderá receber novos
              agendamentos. Você pode reativar o cadastro depois.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-4">
            {fields}
            {state?.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Voltar</DialogClose>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Salvando…" : "Inativar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {feedback}
    </div>
  );
}
