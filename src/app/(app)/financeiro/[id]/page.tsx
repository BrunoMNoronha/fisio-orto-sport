import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { getCharge, type ChargeDetail } from "@/modules/financeiro/queries";
import { CHARGE_STATUS_LABELS, formatBRL, formatCivilDate, patientLabel } from "@/modules/financeiro/validation";
import { formatDateTime } from "../../agenda/format";
import { CancelChargeForm } from "./cancel-charge-form";

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

export default async function CobrancaPage({ params }: PageProps<"/financeiro/[id]">) {
  const actor = await requirePermission("financeiro:ler");
  const canManage = can(actor.role, "financeiro:gerir");
  const { id } = await params;
  const charge = await getCharge(id);
  if (!charge) notFound();
  const active = charge.status === "ATIVA";
  const cancelledBy = charge.cancelledBy ? ` por ${charge.cancelledBy.name}` : "";

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
          </div>
          {canManage && active && (
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/financeiro/${charge.id}/substituir`} className={buttonVariants({ variant: "outline" })}>
                Substituir
              </Link>
              <CancelChargeForm id={charge.id} />
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
            {/* Antes dos pagamentos (FIN-02), o saldo é o valor original. */}
            <Item label="Saldo" value={active ? formatBRL(charge.amountCents) : "Não se aplica (cancelada)"} />
            <div className="sm:col-span-2">
              <Item label="Descrição" value={charge.description} />
            </div>
          </dl>
        </CardContent>
      </Card>

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
