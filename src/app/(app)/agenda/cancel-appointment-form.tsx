"use client";

import { useActionState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelAppointment } from "@/modules/agenda/actions";

// O cancelamento não pode ser desfeito: pede confirmação num diálogo antes de chamar a action.
// Depois do sucesso a página revalida e o formulário deixa de ser renderizado.
export function CancelAppointmentForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(cancelAppointment, undefined);
  const reasonError = state?.fieldErrors?.reason?.[0];

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card shadow-xs p-4">
      <Dialog>
        <DialogTrigger render={<Button variant="destructive" />}>Cancelar agendamento</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar este agendamento?</DialogTitle>
            <DialogDescription>
              O cancelamento não pode ser desfeito. Para atender o paciente depois, crie um novo agendamento.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-4">
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
            {state?.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Voltar</DialogClose>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Cancelando…" : "Confirmar cancelamento"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {state?.message}
      </p>
    </div>
  );
}
