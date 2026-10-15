import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requirePermission } from "@/modules/auth/dal";
import { createPaymentAction } from "@/modules/financeiro/payment-actions";
import { getPaymentFormContext } from "@/modules/financeiro/payment-queries";
import { todayInSaoPaulo } from "@/modules/financeiro/payment-validation";
import { formatAmountInput, formatBRL, formatCivilDate, patientLabel } from "@/modules/financeiro/validation";
import { firstParam } from "@/modules/pacientes/validation";
import { PaymentForm } from "../../../payment-form";

export const metadata: Metadata = { title: "Registrar recebimento — TechLab+ Fisio OrtoSport" };

export default async function NovoPagamentoPage({ params, searchParams }: PageProps<"/financeiro/[id]/pagamentos/novo">) {
  await requirePermission("financeiro:gerir");
  const { id } = await params;
  const replacesPaymentId = firstParam((await searchParams).replacesPaymentId);
  const context = await getPaymentFormContext(id, replacesPaymentId);
  if (!context) notFound();
  const { charge, payment, balanceCents } = context;
  const today = todayInSaoPaulo();
  const blocked = charge.status !== "ATIVA" ? "Esta cobrança está cancelada e não aceita recebimentos."
    : payment && (!payment.reversal || payment.replacedBy) ? "O pagamento original deve estar estornado e ainda não ter substituto."
    : balanceCents <= 0 ? "Esta cobrança já está quitada. Não há saldo disponível para um recebimento." : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href={`/financeiro/${id}`} className="text-sm text-muted-foreground hover:text-foreground">← Cobrança</Link>
        <h1 className="text-2xl font-semibold tracking-tight">{payment ? "Registrar pagamento substituto" : "Registrar recebimento"}</h1>
        <p className="text-sm text-muted-foreground">{patientLabel(charge.patient)} · {charge.description} · saldo {formatBRL(balanceCents)}</p>
        {payment && <p className="text-sm text-muted-foreground">Substitui o pagamento estornado de {formatBRL(payment.amountCents)}, recebido em {formatCivilDate(payment.receivedOn)}. O estorno anterior será preservado.</p>}
      </div>
      {blocked ? <Alert><AlertDescription>{blocked}</AlertDescription></Alert> : (
        <PaymentForm action={createPaymentAction} requestId={crypto.randomUUID()} chargeId={id} replacesPaymentId={payment?.id}
          initial={{ amount: formatAmountInput(Math.min(payment?.amountCents ?? balanceCents, balanceCents)), receivedOn: today, reversedOn: "", reason: "" }}
          today={today} cancelHref={`/financeiro/${id}`} />
      )}
    </div>
  );
}
