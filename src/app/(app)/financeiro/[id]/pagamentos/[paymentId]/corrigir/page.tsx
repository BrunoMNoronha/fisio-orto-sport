import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requirePermission } from "@/modules/auth/dal";
import { replacePaymentAction } from "@/modules/financeiro/payment-actions";
import { getPaymentFormContext } from "@/modules/financeiro/payment-queries";
import { todayInSaoPaulo } from "@/modules/financeiro/payment-validation";
import { formatAmountInput, formatBRL, formatCivilDate, patientLabel, toDateInput } from "@/modules/financeiro/validation";
import { PaymentForm } from "../../../../payment-form";

export const metadata: Metadata = { title: "Corrigir pagamento — TechLab+ Fisio OrtoSport" };

export default async function CorrigirPagamentoPage({ params }: PageProps<"/financeiro/[id]/pagamentos/[paymentId]/corrigir">) {
  await requirePermission("financeiro:gerir");
  const { id, paymentId } = await params;
  const context = await getPaymentFormContext(id, paymentId);
  if (!context?.payment) notFound();
  const { charge, payment, balanceCents } = context;
  const today = todayInSaoPaulo();
  const blocked = charge.status !== "ATIVA" ? "Esta cobrança está cancelada e não aceita correções de pagamento."
    : payment.reversal ? "Este pagamento já está estornado. Para registrar uma substituição, use o histórico da cobrança." : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href={`/financeiro/${id}`} className="text-sm text-muted-foreground hover:text-foreground">← Cobrança</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Corrigir pagamento</h1>
        <p className="text-sm text-muted-foreground">{patientLabel(charge.patient)} · {charge.description}</p>
        <p className="text-sm text-muted-foreground">
          Original: {formatBRL(payment.amountCents)} recebido em {formatCivilDate(payment.receivedOn)}.
          {!blocked && <> Após o estorno, ficam disponíveis {formatBRL(balanceCents + payment.amountCents)} para o substituto.</>}
        </p>
      </div>
      {blocked ? <Alert><AlertDescription>{blocked}</AlertDescription></Alert> : (
        <PaymentForm action={replacePaymentAction} requestId={crypto.randomUUID()} chargeId={id} paymentId={payment.id}
          initial={{ amount: formatAmountInput(payment.amountCents), receivedOn: toDateInput(payment.receivedOn), reversedOn: today, reason: "" }}
          originalReceivedOn={toDateInput(payment.receivedOn)} today={today} cancelHref={`/financeiro/${id}`} />
      )}
    </div>
  );
}
