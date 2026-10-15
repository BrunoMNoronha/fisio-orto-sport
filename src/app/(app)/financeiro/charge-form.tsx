"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { searchChargePatients, type ChargeActionState } from "@/modules/financeiro/actions";
import { DESCRIPTION_MAX, REASON_MAX, formatAmountInput, parseAmount } from "@/modules/financeiro/validation";
import { PatientCombobox } from "../agenda/patient-combobox";

type Action = (prev: ChargeActionState, formData: FormData) => Promise<ChargeActionState>;
type Option = { id: string; label: string };

export type ChargeFormValues = { description: string; amount: string; dueDate: string; reason: string };

// Financeiro: qualquer paciente cadastrado, inclusive inativo (rotulado na lista).
const CHARGE_PATIENT_TEXTS = { noun: "paciente", plural: "pacientes", listLabel: "Pacientes" };

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}

function a11y(id: string, errors?: string[], hint?: string) {
  const describedBy = [hint, errors ? `${id}-erro` : undefined].filter(Boolean).join(" ");
  return {
    id,
    "aria-invalid": errors ? true : undefined,
    "aria-describedby": describedBy || undefined,
  } as const;
}

// Lançamento de cobrança (create) ou substituição (replace): a substituição traz os dados da
// original para corrigir e exige o motivo do cancelamento. `requestId` é gerado quando a página abre;
// reenviar o mesmo formulário não cria uma segunda cobrança.
export function ChargeForm({
  action,
  requestId,
  chargeId,
  initialPatient,
  initial,
  cancelHref,
  submitLabel,
}: {
  action: Action;
  requestId: string;
  // Substituição: id da cobrança original.
  chargeId?: string;
  initialPatient: Option | null;
  initial: ChargeFormValues;
  cancelHref: string;
  submitLabel: string;
}) {
  const [values, setValues] = useState(initial);
  const [patient, setPatient] = useState<Option | null>(initialPatient);
  const [state, formAction, pending] = useActionState(action, undefined);
  const errors = state?.fieldErrors;
  const replacing = Boolean(chargeId);

  function field(name: keyof ChargeFormValues) {
    return {
      name,
      value: values[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = event.target.value;
        setValues((current) => ({ ...current, [name]: value }));
      },
    };
  }

  // Ao sair do campo, um valor válido é reescrito no formato da clínica (1.234,56).
  function normalizeAmount() {
    const parsed = parseAmount(values.amount);
    if ("cents" in parsed) setValues((current) => ({ ...current, amount: formatAmountInput(parsed.cents) }));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      {chargeId && <input type="hidden" name="id" value={chargeId} />}
      {state?.error && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <PatientCombobox
          name="patientId"
          value={patient}
          errors={errors?.patientId}
          search={searchChargePatients}
          texts={CHARGE_PATIENT_TEXTS}
          onChange={setPatient}
        />

        <div className="flex flex-col gap-2 sm:col-span-3">
          <Label htmlFor="cobranca-description">Descrição *</Label>
          <Input
            {...a11y("cobranca-description", errors?.description, "cobranca-description-ajuda")}
            {...field("description")}
            maxLength={DESCRIPTION_MAX}
            required
          />
          <p id="cobranca-description-ajuda" className="text-xs text-muted-foreground">
            Descrição administrativa, como &quot;Pacote de 10 sessões — outubro&quot;. Não registre informações clínicas.
          </p>
          <FieldError id="cobranca-description-erro" messages={errors?.description} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cobranca-amount">Valor (R$) *</Label>
          <Input
            {...a11y("cobranca-amount", errors?.amount, "cobranca-amount-ajuda")}
            {...field("amount")}
            onBlur={normalizeAmount}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            maxLength={16}
            required
          />
          <p id="cobranca-amount-ajuda" className="text-xs text-muted-foreground">
            Use vírgula para os centavos.
          </p>
          <FieldError id="cobranca-amount-erro" messages={errors?.amount} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cobranca-dueDate">Vencimento *</Label>
          <Input {...a11y("cobranca-dueDate", errors?.dueDate)} {...field("dueDate")} type="date" required />
          <FieldError id="cobranca-dueDate-erro" messages={errors?.dueDate} />
        </div>
      </div>

      {replacing && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="cobranca-reason">Motivo do cancelamento da original *</Label>
          <Textarea
            {...a11y("cobranca-reason", errors?.reason, "cobranca-reason-ajuda")}
            {...field("reason")}
            maxLength={REASON_MAX}
            rows={3}
            required
          />
          <p id="cobranca-reason-ajuda" className="text-xs text-muted-foreground">
            A cobrança original será cancelada com este motivo e continuará no histórico, ligada à nova.
          </p>
          <FieldError id="cobranca-reason-erro" messages={errors?.reason} />
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : submitLabel}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Voltar
        </Link>
      </div>
    </form>
  );
}
