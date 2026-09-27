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
import { removeBlock } from "@/modules/agenda/actions";

// Remover libera o horário e não mexe em agendamentos. Confirma num diálogo antes da action.
export function RemoveBlockForm({ id, label }: { id: string; label: string }) {
  const [state, formAction, pending] = useActionState(removeBlock, undefined);

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Remover</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover este bloqueio?</DialogTitle>
          <DialogDescription>
            {label}. O horário volta a ficar livre para agendamentos. Para bloquear de novo, crie outro bloqueio.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={id} />
          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Voltar</DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Removendo…" : "Remover bloqueio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
