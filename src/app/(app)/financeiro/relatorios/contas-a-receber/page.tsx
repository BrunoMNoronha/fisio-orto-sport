import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/modules/auth/dal";
import { getReceivablesReport } from "@/modules/financeiro/report-queries";
import { todayInSaoPaulo } from "@/modules/financeiro/payment-validation";
import { formatCivilDate, patientLabel, toDateInput } from "@/modules/financeiro/validation";
import { filterFormValues, MoneyItem, RECEIVABLES_PATH, ReportNavigation, ReportPagination, ReportTotals } from "../report-common";
import { ReportFilters } from "../report-filters";

export const metadata: Metadata = { title: "Contas a receber — TechLab+ Fisio OrtoSport" };

export default async function ReceivablesPage({ searchParams }: PageProps<"/financeiro/relatorios/contas-a-receber">) {
  await requirePermission("financeiro:ler");
  const raw = await searchParams;
  const now = new Date();
  const report = await getReceivablesReport(raw, now);
  const today = todayInSaoPaulo(now);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Contas a receber</h1>
        <p className="text-sm text-muted-foreground">Cobranças ativas com saldo em aberto, incluindo pagamentos parciais.</p>
      </div>
      <ReportNavigation active="receivables" filters={report.filters} />
      <ReportFilters key={JSON.stringify(raw)} action={RECEIVABLES_PATH} {...filterFormValues(raw, report.filters, report.patient)} dateLabel="Período por vencimento da cobrança" />

      {report.error ? (
        <Alert variant="destructive"><AlertDescription>{report.error}</AlertDescription></Alert>
      ) : (
        <>
          <ReportTotals items={[
            { label: "Cobrado", value: report.totals.chargedCents },
            { label: "Recebido válido", value: report.totals.receivedCents },
            { label: "Saldo a receber", value: report.totals.balanceCents },
            { label: "Saldo vencido", value: report.totals.overdueCents },
          ]} />
          <section aria-labelledby="contas-lista" className="flex min-w-0 flex-col gap-3">
            <h2 id="contas-lista" className="text-lg font-semibold">Cobranças em aberto</h2>
            <p className="text-xs text-muted-foreground">Saldo vencido considera vencimentos anteriores ao dia de hoje em São Paulo.</p>
            {report.items.length === 0 ? (
              <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma conta a receber encontrada com esses filtros.</p>
            ) : (
              <ol className="flex min-w-0 flex-col gap-3">
                {report.items.map((charge) => (
                  <li key={charge.id} className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/financeiro/${charge.id}`} className="font-medium break-words underline-offset-4 hover:underline">{patientLabel(charge.patient)}</Link>
                        <p className="mt-1 text-sm break-words">{charge.description}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Vencimento em {formatCivilDate(charge.dueDate)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={charge.overdue ? "destructive" : "secondary"}>
                          {charge.overdue ? "Vencida" : toDateInput(charge.dueDate) === today ? "Vence hoje" : "A vencer"}
                        </Badge>
                        {charge.receivedCents > BigInt(0) && <Badge variant="outline">Pagamento parcial</Badge>}
                      </div>
                    </div>
                    <dl className="grid min-w-0 gap-3 sm:grid-cols-3">
                      <MoneyItem label="Valor da cobrança" cents={charge.amountCents} />
                      <MoneyItem label="Recebido válido" cents={charge.receivedCents} />
                      <MoneyItem label="Saldo a receber" cents={charge.balanceCents} />
                    </dl>
                    <Link href={`/financeiro/${charge.id}`} className="self-start text-sm underline underline-offset-4">Ver cobrança</Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
          {report.filters && <ReportPagination path={RECEIVABLES_PATH} filters={report.filters} page={report.page} pageCount={report.pageCount} total={report.total} noun={["cobrança", "cobranças"]} />}
        </>
      )}
    </div>
  );
}
