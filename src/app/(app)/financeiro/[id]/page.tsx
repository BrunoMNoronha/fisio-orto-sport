import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import type { ChargeDetail } from "@/modules/financeiro/queries";
import { getChargeFinancialDetail } from "@/modules/financeiro/payment-queries";
import { todayInSaoPaulo } from "@/modules/financeiro/payment-validation";
import { CHARGE_STATUS_LABELS, formatBRL, formatCivilDate, listChargesSchema, patientLabel, toDateInput } from "@/modules/financeiro/validation";
import { firstParam } from "@/modules/pacientes/validation";
import { formatDateTime } from "../../agenda/format";
import { CancelChargeForm } from "./cancel-charge-form";
import { ReversePaymentForm } from "./reverse-payment-form";

export const metadata: Metadata = { title: "Cobrança — TechLab+ Fisio OrtoSport" };

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-line">{value || "—"}</dd>
    </div>
  );
}

function Linked({ charge }: { charge: NonNullable<ChargeDetail["replaces"]> }) {
  return (
    <Link href={`/financeiro/${charge.id}`} className="underline-offset-4 hover:underline">
      {charge.description} · {formatBRL(charge.amountCents)} · vence em {formatCivilDate(charge.dueDate)} (
      {CHARGE_STATUS_LABELS[charge.status].toLowerCase()})
    </Link>
  );
}

export default async function CobrancaPage({ params, searchParams }: PageProps<"/financeiro/[id]">) {
  const actor = await requirePermission("financeiro:ler");
  const canManage = can(actor.role, "financeiro:gerir");
  const { id } = await params;
  const requestedPage = listChargesSchema.parse({ page: firstParam((await searchParams).page) }).page;
  const detail = await getChargeFinancialDetail(id, requestedPage);
  if (!detail) notFound();
  const { charge, receivedCents, balanceCents, settlement, payments, total, page, pageCount } = detail;
  const active = charge.status === "ATIVA";
  const cancelledBy = charge.cancelledBy ? ` por ${charge.cancelledBy.name}` : "";
  const today = todayInSaoPaulo();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link href="/financeiro" className="text-sm text-muted-foreground hover:text-foreground">
          ← Financeiro
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Cobrança</h1>
            <Badge variant={active ? "secondary" : "outline"}>{CHARGE_STATUS_LABELS[charge.status]}</Badge>
            {active && <Badge variant="outline">{settlement}</Badge>}
          </div>
          {canManage && active && (
            <div className="flex flex-wrap items-center gap-2">
              {balanceCents > 0 && <Link href={`/financeiro/${charge.id}/pagamentos/novo`} className={buttonVariants()}>Registrar recebimento</Link>}
              {receivedCents === 0 && <>
                <Link href={`/financeiro/${charge.id}/substituir`} className={buttonVariants({ variant: "outline" })}>Substituir</Link>
                <CancelChargeForm id={charge.id} />
              </>}
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-2xl font-semibold tabular-nums text-primary">{formatBRL(charge.amountCents)}</p>
            <p className="text-sm text-muted-foreground">Vencimento em {formatCivilDate(charge.dueDate)}</p>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Item
              label="Paciente"
              value={
                <Link href={`/financeiro?patientId=${charge.patient.id}`} className="underline-offset-4 hover:underline">
                  {patientLabel(charge.patient)}
                </Link>
              }
            />
            <Item label="Cobrado" value={formatBRL(charge.amountCents)} />
            <Item label="Recebido válido" value={formatBRL(receivedCents)} />
            <Item label="Saldo" value={active ? formatBRL(balanceCents) : "Não se aplica (cancelada)"} />
            <div className="sm:col-span-2">
              <Item label="Descrição" value={charge.description} />
            </div>
          </dl>
        </CardContent>
      </Card>

      <section aria-labelledby="pagamentos" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pagamentos" className="text-lg font-semibold">Pagamentos</h2>
          <p className="text-sm text-muted-foreground">{total} {total === 1 ? "pagamento" : "pagamentos"}</p>
        </div>
        {payments.length === 0 ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">Nenhum pagamento registrado.</p> : (
          <ol className="flex flex-col gap-3">
            {payments.map((payment) => (
              <li key={payment.id} id={`pagamento-${payment.id}`} className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold tabular-nums">{formatBRL(payment.amountCents)}</p>
                  <Badge variant={payment.reversal ? "outline" : "secondary"}>{payment.reversal ? "Estornado" : "Válido"}</Badge>
                </div>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Item label="Recebido em" value={formatCivilDate(payment.receivedOn)} />
                  <Item label="Registrado em" value={`${formatDateTime(payment.createdAt)} por ${payment.createdBy.name}`} />
                  {payment.replaces && <Item label="Substitui o pagamento" value={`${formatBRL(payment.replaces.amountCents)} recebido em ${formatCivilDate(payment.replaces.receivedOn)}`} />}
                  {payment.reversal && <>
                    <Item label="Estornado em" value={formatCivilDate(payment.reversal.reversedOn)} />
                    <Item label="Estorno registrado em" value={`${formatDateTime(payment.reversal.createdAt)} por ${payment.reversal.createdBy.name}`} />
                    <div className="sm:col-span-2"><Item label="Motivo do estorno" value={payment.reversal.reason} /></div>
                  </>}
                  {payment.replacedBy && <Item label="Pagamento substituto" value={`${formatBRL(payment.replacedBy.amountCents)} recebido em ${formatCivilDate(payment.replacedBy.receivedOn)}`} />}
                </dl>
                {canManage && active && <div className="flex flex-wrap gap-2">
                  {!payment.reversal ? <>
                    <Link href={`/financeiro/${charge.id}/pagamentos/${payment.id}/corrigir`} className={buttonVariants({ variant: "outline", size: "sm" })}>Corrigir</Link>
                    <ReversePaymentForm paymentId={payment.id} requestId={crypto.randomUUID()} receivedOn={toDateInput(payment.receivedOn)} today={today} />
                  </> : !payment.replacedBy && balanceCents > 0 && (
                    <Link href={`/financeiro/${charge.id}/pagamentos/novo?replacesPaymentId=${payment.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Registrar substituto</Link>
                  )}
                </div>}
              </li>
            ))}
          </ol>
        )}
        {pageCount > 1 && <nav aria-label="Paginação dos pagamentos" className="flex flex-wrap items-center justify-between gap-3">
          {page > 1 ? <Link href={`/financeiro/${id}?page=${page - 1}#pagamentos`} className={buttonVariants({ variant: "outline" })}>Anterior</Link> : <span />}
          <p className="text-sm text-muted-foreground">Página {page} de {pageCount}</p>
          {page < pageCount ? <Link href={`/financeiro/${id}?page=${page + 1}#pagamentos`} className={buttonVariants({ variant: "outline" })}>Próxima</Link> : <span />}
        </nav>}
      </section>

      <section aria-labelledby="historico" className="flex flex-col gap-3">
        <h2 id="historico" className="text-lg font-semibold">
          Histórico
        </h2>
        <dl className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-2">
          <Item label="Lançada em" value={`${formatDateTime(charge.createdAt)} por ${charge.createdBy.name}`} />
          {charge.replaces && <Item label="Substitui a cobrança" value={<Linked charge={charge.replaces} />} />}
          {!active && (
            <>
              <Item
                label="Cancelada em"
                value={charge.cancelledAt ? `${formatDateTime(charge.cancelledAt)}${cancelledBy}` : null}
              />
              {charge.replacedBy && <Item label="Substituída por" value={<Linked charge={charge.replacedBy} />} />}
              <div className="sm:col-span-2">
                <Item label="Motivo do cancelamento" value={charge.cancelReason} />
              </div>
            </>
          )}
        </dl>
      </section>
    </div>
  );
}
