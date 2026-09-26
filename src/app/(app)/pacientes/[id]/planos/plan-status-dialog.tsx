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
import type { PlanActionState } from "@/modules/clinico/plan-actions";
import { PLAN_LIMITS, type PlanStatusValue } from "@/modules/clinico/plan-validation";

type Action = (prev: PlanActionState, formData: FormData) => Promise<PlanActionState>;

// Encerrar ou reabrir o plano, sempre com motivo. Encerrar não é alta clínica.
export function PlanStatusDialog({ action, status }: { action: Action; status: PlanStatusValue }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: PlanActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result?.ok) setOpen(false);
    return result;
  }, undefined);
  const closing = status === "ATIVO";
  const reasonError = state?.fieldErrors?.reason?.[0];

  return (
    <div className="flex flex-col items-start gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="outline" />}>{closing ? "Encerrar plano" : "Reabrir plano"}</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{closing ? "Encerrar este plano?" : "Reabrir este plano?"}</DialogTitle>
            <DialogDescription>
              {closing
                ? "O plano deixa de receber revisões até ser reaberto. Encerrar não registra alta clínica."
                : "O plano volta a ficar ativo e pode receber novas revisões."}
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="toStatus" value={closing ? "ENCERRADO" : "ATIVO"} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="plano-status-motivo">Motivo *</Label>
              <Textarea
                id="plano-status-motivo"
                name="reason"
                rows={2}
                maxLength={PLAN_LIMITS.reason}
                required
                aria-invalid={reasonError ? true : undefined}
                aria-describedby={reasonError ? "plano-status-motivo-erro" : undefined}
              />
              {reasonError && (
                <p id="plano-status-motivo-erro" className="text-sm text-destructive">
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
              <Button type="submit" variant={closing ? "destructive" : "default"} disabled={pending}>
                {pending ? "Salvando…" : closing ? "Encerrar" : "Reabrir"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {state?.ok ? state.message : null}
      </p>
    </div>
  );
}
