"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reversePaymentAction } from "@/modules/financeiro/payment-actions";
import { REASON_MAX } from "@/modules/financeiro/validation";

export function ReversePaymentForm({ paymentId, requestId, receivedOn, today }: {
  paymentId: string; requestId: string; receivedOn: string; today: string;
}) {
  const [operationId] = useState(requestId);
  const [values, setValues] = useState({ reason: "", reversedOn: today });
  const [state, formAction, pending] = useActionState(reversePaymentAction, undefined);
  const errors = state?.fieldErrors;
  const reasonId = `estorno-${paymentId}-reason`;
  const dateId = `estorno-${paymentId}-reversedOn`;
  const genericError = state?.error || errors?.paymentId?.[0] || errors?.requestId?.[0];

  return (
    <div>
      <Dialog>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>Estornar</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estornar este pagamento?</DialogTitle>
            <DialogDescription>O pagamento continuará no histórico e deixará de abater o saldo. Informe a data e o motivo administrativo.</DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-4" noValidate>
            <input type="hidden" name="paymentId" value={paymentId} />
            <input type="hidden" name="requestId" value={operationId} />
            <div className="flex flex-col gap-2">
              <Label htmlFor={dateId}>Data do estorno *</Label>
              <Input id={dateId} name="reversedOn" type="date" min={receivedOn} max={today} required readOnly={pending}
                value={values.reversedOn} onChange={(event) => setValues((current) => ({ ...current, reversedOn: event.target.value }))}
                aria-invalid={errors?.reversedOn?.length ? true : undefined} aria-describedby={errors?.reversedOn?.length ? `${dateId}-erro` : undefined} />
              {errors?.reversedOn?.[0] && <p id={`${dateId}-erro`} aria-live="polite" className="text-sm text-destructive">{errors.reversedOn[0]}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={reasonId}>Motivo do estorno *</Label>
              <Textarea id={reasonId} name="reason" maxLength={REASON_MAX} rows={3} required readOnly={pending}
                value={values.reason} onChange={(event) => setValues((current) => ({ ...current, reason: event.target.value }))}
                aria-invalid={errors?.reason?.length ? true : undefined} aria-describedby={errors?.reason?.length ? `${reasonId}-erro` : undefined} />
              {errors?.reason?.[0] && <p id={`${reasonId}-erro`} aria-live="polite" className="text-sm text-destructive">{errors.reason[0]}</p>}
            </div>
            {genericError && <p role="alert" className="text-sm text-destructive">{genericError}</p>}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Voltar</DialogClose>
              <Button type="submit" variant="destructive" disabled={pending}>{pending ? "Estornando…" : "Confirmar estorno"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <p role="status" className="text-sm text-muted-foreground">{state?.message}</p>
    </div>
  );
}
