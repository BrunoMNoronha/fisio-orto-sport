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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelChargeAction } from "@/modules/financeiro/actions";
import { REASON_MAX } from "@/modules/financeiro/validation";

// O cancelamento não pode ser desfeito: pede confirmação e motivo num diálogo. Depois do sucesso a
// página revalida e o botão deixa de aparecer; repetir (outra aba) não altera o cancelamento.
export function CancelChargeForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(cancelChargeAction, undefined);
  const reasonError = state?.fieldErrors?.reason?.[0];

  return (
    <>
      <Dialog>
        <DialogTrigger render={<Button variant="destructive" />}>Cancelar cobrança</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar esta cobrança?</DialogTitle>
            <DialogDescription>
              O cancelamento não pode ser desfeito. A cobrança continua no histórico, mas deixa de valer. Para corrigir
              valor, paciente, descrição ou vencimento, prefira &quot;Substituir&quot;.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={id} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="cancelar-cobranca-motivo">Motivo do cancelamento *</Label>
              <Textarea
                id="cancelar-cobranca-motivo"
                name="reason"
                maxLength={REASON_MAX}
                rows={3}
                required
                aria-invalid={reasonError ? true : undefined}
                aria-describedby={reasonError ? "cancelar-cobranca-motivo-erro" : undefined}
              />
              {reasonError && (
                <p id="cancelar-cobranca-motivo-erro" className="text-sm text-destructive">
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
    </>
  );
}
