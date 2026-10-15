"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PaymentActionState } from "@/modules/financeiro/payment-actions";
import { REASON_MAX, formatAmountInput, parseAmount } from "@/modules/financeiro/validation";

export type PaymentFormValues = { amount: string; receivedOn: string; reversedOn: string; reason: string };
type Action = (prev: PaymentActionState, formData: FormData) => Promise<PaymentActionState>;

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  return messages?.length ? <p id={id} aria-live="polite" className="text-sm text-destructive">{messages[0]}</p> : null;
}

function a11y(id: string, errors?: string[], hint?: string) {
  return {
    id,
    "aria-invalid": errors?.length ? true : undefined,
    "aria-describedby": [hint, errors?.length ? `${id}-erro` : undefined].filter(Boolean).join(" ") || undefined,
  } as const;
}

export function PaymentForm({
  action, requestId, chargeId, paymentId, replacesPaymentId, initial, today, originalReceivedOn, cancelHref,
}: {
  action: Action;
  requestId: string;
  chargeId: string;
  paymentId?: string;
  replacesPaymentId?: string;
  initial: PaymentFormValues;
  today: string;
  originalReceivedOn?: string;
  cancelHref: string;
}) {
  const [values, setValues] = useState(initial);
  const [operationId] = useState(requestId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const errors = state?.fieldErrors;
  const correcting = Boolean(paymentId);
  const hiddenError = errors?.requestId?.[0] || errors?.chargeId?.[0] || errors?.paymentId?.[0] || errors?.replacesPaymentId?.[0];

  function field(name: keyof PaymentFormValues) {
    return {
      name,
      value: values[name],
      readOnly: pending,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setValues((current) => ({ ...current, [name]: event.target.value }));
      },
    };
  }

  function normalizeAmount() {
    const parsed = parseAmount(values.amount);
    if ("cents" in parsed) setValues((current) => ({ ...current, amount: formatAmountInput(parsed.cents) }));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="requestId" value={operationId} />
      {correcting ? <input type="hidden" name="paymentId" value={paymentId} /> : <input type="hidden" name="chargeId" value={chargeId} />}
      {replacesPaymentId && <input type="hidden" name="replacesPaymentId" value={replacesPaymentId} />}
      {(state?.error || hiddenError) && (
        <Alert variant="destructive" role="alert"><AlertDescription>{state?.error || hiddenError}</AlertDescription></Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="pagamento-amount">Valor recebido (R$) *</Label>
          <Input {...a11y("pagamento-amount", errors?.amount, "pagamento-amount-ajuda")} {...field("amount")}
            onBlur={normalizeAmount} inputMode="decimal" autoComplete="off" placeholder="0,00" maxLength={16} required />
          <p id="pagamento-amount-ajuda" className="text-xs text-muted-foreground">Use vírgula para os centavos.</p>
          <FieldError id="pagamento-amount-erro" messages={errors?.amount} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pagamento-receivedOn">Data do recebimento *</Label>
          <Input {...a11y("pagamento-receivedOn", errors?.receivedOn, "pagamento-receivedOn-ajuda")} {...field("receivedOn")}
            type="date" min="2000-01-01" max={today} required />
          <p id="pagamento-receivedOn-ajuda" className="text-xs text-muted-foreground">Pode ser anterior à cobrança; não pode ser futura.</p>
          <FieldError id="pagamento-receivedOn-erro" messages={errors?.receivedOn} />
        </div>
      </div>
      {correcting && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pagamento-reversedOn">Data do estorno da original *</Label>
            <Input {...a11y("pagamento-reversedOn", errors?.reversedOn)} {...field("reversedOn")}
              type="date" min={originalReceivedOn || "2000-01-01"} max={today} required />
            <FieldError id="pagamento-reversedOn-erro" messages={errors?.reversedOn} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pagamento-reason">Motivo da correção *</Label>
            <Textarea {...a11y("pagamento-reason", errors?.reason, "pagamento-reason-ajuda")} {...field("reason")}
              maxLength={REASON_MAX} rows={3} required />
            <p id="pagamento-reason-ajuda" className="text-xs text-muted-foreground">
              A original será estornada e o novo recebimento ficará ligado a ela. Registre apenas informações administrativas.
            </p>
            <FieldError id="pagamento-reason-erro" messages={errors?.reason} />
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Salvando…" : correcting ? "Estornar original e registrar substituto" : "Registrar recebimento"}</Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>Voltar</Link>
      </div>
    </form>
  );
}
