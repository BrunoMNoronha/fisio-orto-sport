import { z } from "zod";
import { AMOUNT_MAX_CENTS, AMOUNT_MESSAGES, REASON_MAX, isPlausibleId, parseAmount, toDateInput } from "./validation";

export const PAYMENT_MESSAGES = {
  chargeNotFound: "Cobrança não encontrada.",
  paymentNotFound: "Pagamento não encontrado.",
  chargeCancelled: "Esta cobrança está cancelada e não recebe novos pagamentos.",
  exceedsBalance: "O valor do pagamento supera o saldo disponível. Confira o saldo atualizado.",
  invalidBalance: "O saldo desta cobrança está inconsistente. A operação não foi registrada.",
  keyMismatch: "Esta operação já foi registrada com outros dados e não foi alterada. Recarregue o formulário para registrar uma nova operação.",
  alreadyReversed: "Este pagamento já foi estornado. Registre um substituto para corrigir o lançamento.",
  notReversed: "O pagamento original precisa estar estornado para receber um substituto.",
  alreadyReplaced: "Este pagamento já tem um substituto. Consulte o histórico atualizado.",
  differentCharge: "O pagamento substituto deve pertencer à mesma cobrança do original.",
  receivedRequired: "Informe a data do recebimento.",
  receivedInvalid: "Informe uma data de recebimento válida.",
  receivedRange: "Informe uma data de recebimento entre 2000 e 2100.",
  receivedFuture: "A data do recebimento não pode ser futura.",
  reversedRequired: "Informe a data do estorno.",
  reversedInvalid: "Informe uma data de estorno válida.",
  reversedRange: "Informe uma data de estorno entre 2000 e 2100.",
  reversedFuture: "A data do estorno não pode ser futura.",
  reversedBeforeReceived: "A data do estorno não pode ser anterior ao recebimento original.",
  requestInvalid: "Dados inválidos. Recarregue a página.",
} as const;

const CIVIL_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// O dia da clínica não depende do fuso horário do navegador ou do processo Node.
export function todayInSaoPaulo(now: Date = new Date()): string {
  const parts = CIVIL_DAY.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const id = (message: string) => z.string({ error: message }).trim().refine(isPlausibleId, { error: message });
const requestId = z.string({ error: PAYMENT_MESSAGES.requestInvalid }).regex(/^[A-Za-z0-9-]{8,64}$/, {
  error: PAYMENT_MESSAGES.requestInvalid,
});
const reason = z.string({ error: "Informe o motivo." }).trim().min(1, { error: "Informe o motivo." }).max(REASON_MAX, {
  error: `O motivo deve ter no máximo ${REASON_MAX} caracteres.`,
});
const replacesPaymentId = z.string().trim().optional().transform((value) => value || undefined).pipe(
  id(PAYMENT_MESSAGES.paymentNotFound).optional(),
);

const amount = z.string({ error: AMOUNT_MESSAGES.required }).transform((value, ctx) => {
  const parsed = parseAmount(value);
  if ("error" in parsed) {
    ctx.addIssue({ code: "custom", message: parsed.error });
    return z.NEVER;
  }
  return parsed.cents;
});

type DateKind = "received" | "reversed";
function dateMessages(kind: DateKind) {
  return kind === "received"
    ? { required: PAYMENT_MESSAGES.receivedRequired, invalid: PAYMENT_MESSAGES.receivedInvalid, range: PAYMENT_MESSAGES.receivedRange, future: PAYMENT_MESSAGES.receivedFuture }
    : { required: PAYMENT_MESSAGES.reversedRequired, invalid: PAYMENT_MESSAGES.reversedInvalid, range: PAYMENT_MESSAGES.reversedRange, future: PAYMENT_MESSAGES.reversedFuture };
}

function checkedDate(kind: DateKind, now?: Date) {
  const messages = dateMessages(kind);
  return z.date({ error: messages.invalid }).superRefine((date, ctx) => {
    // Chamadas diretas também recebem uma data civil, sem descartar silenciosamente a hora.
    if (date.toISOString() !== `${toDateInput(date)}T00:00:00.000Z`) {
      ctx.addIssue({ code: "custom", message: messages.invalid });
      return;
    }
    const year = date.getUTCFullYear();
    if (year < 2000 || year > 2100) {
      ctx.addIssue({ code: "custom", message: messages.range });
      return;
    }
    if (toDateInput(date) > todayInSaoPaulo(now)) ctx.addIssue({ code: "custom", message: messages.future });
  });
}

function formDate(kind: DateKind, now?: Date) {
  const messages = dateMessages(kind);
  return z.string({ error: messages.required }).trim().min(1, { error: messages.required }).transform((value, ctx) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || toDateInput(date) !== value) {
      ctx.addIssue({ code: "custom", message: messages.invalid });
      return z.NEVER;
    }
    return date;
  }).pipe(checkedDate(kind, now));
}

// O relógio opcional permite testar meia-noite e retroatividade com resultados determinísticos.
export function createPaymentSchemas(now?: Date) {
  const payment = {
    amount,
    receivedOn: formDate("received", now),
    requestId,
  };
  const reversal = { reason, reversedOn: formDate("reversed", now), requestId };
  return {
    createPaymentSchema: z.object({ chargeId: id(PAYMENT_MESSAGES.chargeNotFound), ...payment, replacesPaymentId }),
    reversePaymentSchema: z.object({ paymentId: id(PAYMENT_MESSAGES.paymentNotFound), ...reversal }),
    replacePaymentSchema: z.object({ paymentId: id(PAYMENT_MESSAGES.paymentNotFound), ...payment, ...reversal }),
  };
}

export const { createPaymentSchema, reversePaymentSchema, replacePaymentSchema } = createPaymentSchemas();

// O serviço não confia na validação anterior da action. DTOs usam centavos e Date; a forma textual
// fica só nos schemas do formulário. Saldo e a data original do pagamento vêm do banco sob a trava.
export function paymentDataSchemas(now?: Date) {
  const payment = {
    amountCents: z.number({ error: AMOUNT_MESSAGES.format }).int({ error: AMOUNT_MESSAGES.precision })
      .min(1, { error: AMOUNT_MESSAGES.positive }).max(AMOUNT_MAX_CENTS, { error: AMOUNT_MESSAGES.max }),
    receivedOn: checkedDate("received", now),
    requestId,
  };
  const reversal = { reason, reversedOn: checkedDate("reversed", now), requestId };
  return {
    create: z.object({ chargeId: id(PAYMENT_MESSAGES.chargeNotFound), ...payment, replacesPaymentId }),
    reverse: z.object({ paymentId: id(PAYMENT_MESSAGES.paymentNotFound), ...reversal }),
    replace: z.object({ paymentId: id(PAYMENT_MESSAGES.paymentNotFound), ...payment, ...reversal }),
  };
}

export type CreatePaymentInput = z.infer<ReturnType<typeof paymentDataSchemas>["create"]>;
export type ReversePaymentInput = z.infer<ReturnType<typeof paymentDataSchemas>["reverse"]>;
export type ReplacePaymentInput = z.infer<ReturnType<typeof paymentDataSchemas>["replace"]>;
