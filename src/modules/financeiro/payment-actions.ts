"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AuthorizationError, assertPermission } from "@/modules/auth/dal";
import { fieldErrors, type FieldErrors } from "@/modules/auth/validation";
import { PaymentRuleError, createPayment, reversePayment, replacePayment } from "./payment-service";
import { createPaymentSchema, reversePaymentSchema, replacePaymentSchema } from "./payment-validation";
import { formEntries } from "./validation";

export type PaymentActionState = { ok?: boolean; message?: string; error?: string; fieldErrors?: FieldErrors } | undefined;

async function guard(): Promise<{ actorId: string } | { error: string }> {
  try {
    const actor = await assertPermission("financeiro:gerir");
    return { actorId: actor.id };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: "Acesso negado." };
    throw error;
  }
}

function failure(error: unknown): PaymentActionState {
  if (error instanceof PaymentRuleError) {
    return error.field ? { fieldErrors: { [error.field]: [error.message] } } : { error: error.message };
  }
  throw error;
}

export async function createPaymentAction(_prev: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  const actor = await guard();
  if ("error" in actor) return actor;
  const parsed = createPaymentSchema.safeParse(
    formEntries(formData, ["chargeId", "amount", "receivedOn", "requestId", "replacesPaymentId"]),
  );
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  try {
    await createPayment(prisma, actor.actorId, {
      chargeId: parsed.data.chargeId,
      amountCents: parsed.data.amount,
      receivedOn: parsed.data.receivedOn,
      requestId: parsed.data.requestId,
      replacesPaymentId: parsed.data.replacesPaymentId,
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/financeiro", "layout");
  redirect(`/financeiro/${parsed.data.chargeId}`);
}

export async function reversePaymentAction(_prev: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  const actor = await guard();
  if ("error" in actor) return actor;
  const parsed = reversePaymentSchema.safeParse(formEntries(formData, ["paymentId", "reason", "reversedOn", "requestId"]));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  let alreadyReversed: boolean;
  try {
    ({ alreadyReversed } = await reversePayment(prisma, actor.actorId, parsed.data));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/financeiro", "layout");
  return {
    ok: true,
    message: alreadyReversed ? "Este pagamento já estava estornado; nada foi alterado." : "Pagamento estornado.",
  };
}

export async function replacePaymentAction(_prev: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  const actor = await guard();
  if ("error" in actor) return actor;
  const parsed = replacePaymentSchema.safeParse(
    formEntries(formData, ["paymentId", "amount", "receivedOn", "reason", "reversedOn", "requestId"]),
  );
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  let id: string;
  try {
    ({ id } = await replacePayment(prisma, actor.actorId, {
      paymentId: parsed.data.paymentId,
      amountCents: parsed.data.amount,
      receivedOn: parsed.data.receivedOn,
      reason: parsed.data.reason,
      reversedOn: parsed.data.reversedOn,
      requestId: parsed.data.requestId,
    }));
  } catch (error) {
    return failure(error);
  }
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id }, select: { chargeId: true } });
  revalidatePath("/financeiro", "layout");
  redirect(`/financeiro/${payment.chargeId}`);
}
