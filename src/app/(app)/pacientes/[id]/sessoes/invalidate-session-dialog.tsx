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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SessionActionState } from "@/modules/clinico/session-actions";
import { SESSION_LIMITS } from "@/modules/clinico/session-validation";

type Action = (prev: SessionActionState, formData: FormData) => Promise<SessionActionState>;

// Invalidar um atendimento lançado por engano: irreversível, exige motivo e mantém o registro.
export function InvalidateSessionDialog({ action }: { action: Action }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: SessionActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result?.ok) setOpen(false);
    return result;
  }, undefined);
  const reasonError = state?.fieldErrors?.reason?.[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Invalidar</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invalidar este atendimento?</DialogTitle>
          <DialogDescription>
            Use só para um atendimento lançado por engano. Ele continua consultável, mas deixa de contar como realizado
            e não pode mais ser corrigido. Não dá para desfazer.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sessao-invalidar-motivo">Motivo *</Label>
            <Textarea
              id="sessao-invalidar-motivo"
              name="reason"
              rows={2}
              maxLength={SESSION_LIMITS.reason}
              required
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? "sessao-invalidar-motivo-erro" : undefined}
            />
            {reasonError && (
              <p id="sessao-invalidar-motivo-erro" className="text-sm text-destructive">
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
              {pending ? "Salvando…" : "Invalidar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
