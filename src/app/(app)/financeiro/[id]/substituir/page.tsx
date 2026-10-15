import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requirePermission } from "@/modules/auth/dal";
import { replaceChargeAction } from "@/modules/financeiro/actions";
import { getPaymentFormContext } from "@/modules/financeiro/payment-queries";
import { formatAmountInput, formatBRL, formatCivilDate, patientLabel, toDateInput } from "@/modules/financeiro/validation";
import { ChargeForm } from "../../charge-form";

export const metadata: Metadata = { title: "Substituir cobrança — TechLab+ Fisio OrtoSport" };

export default async function SubstituirCobrancaPage({ params }: PageProps<"/financeiro/[id]/substituir">) {
  await requirePermission("financeiro:gerir");
  const { id } = await params;
  const context = await getPaymentFormContext(id);
  if (!context) notFound();
  const { charge, receivedCents } = context;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href={`/financeiro/${charge.id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Cobrança original
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Substituir cobrança</h1>
        <p className="text-sm text-muted-foreground">
          Original: {patientLabel(charge.patient)} · {charge.description} · {formatBRL(charge.amountCents)} · vence em{" "}
          {formatCivilDate(charge.dueDate)}
        </p>
      </div>
      {charge.status === "ATIVA" && receivedCents === 0 ? (
        <ChargeForm
          action={replaceChargeAction}
          requestId={crypto.randomUUID()}
          chargeId={charge.id}
          initialPatient={{ id: charge.patient.id, label: patientLabel(charge.patient) }}
          initial={{
            description: charge.description,
            amount: formatAmountInput(charge.amountCents),
            dueDate: toDateInput(charge.dueDate),
            reason: "",
          }}
          cancelHref={`/financeiro/${charge.id}`}
          submitLabel="Cancelar original e lançar substituta"
        />
      ) : (
        <Alert>
          <AlertDescription>
            {charge.status === "ATIVA" ? "Estorne todos os pagamentos válidos antes de substituir esta cobrança." : "Esta cobrança está cancelada e não pode mais ser substituída."}{" "}
            {charge.replacedBy && (
              <Link href={`/financeiro/${charge.replacedBy.id}`} className="underline underline-offset-4">
                Ver a cobrança substituta
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
