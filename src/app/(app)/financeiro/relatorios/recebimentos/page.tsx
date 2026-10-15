import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/modules/auth/dal";
import { getReceiptsReport } from "@/modules/financeiro/report-queries";
import { formatBRL, formatCivilDate, patientLabel } from "@/modules/financeiro/validation";
import { filterFormValues, RECEIPTS_PATH, ReportNavigation, ReportPagination, ReportTotals } from "../report-common";
import { ReportFilters } from "../report-filters";

export const metadata: Metadata = { title: "Recebimentos — TechLab+ Fisio OrtoSport" };

export default async function ReceiptsPage({ searchParams }: PageProps<"/financeiro/relatorios/recebimentos">) {
  await requirePermission("financeiro:ler");
  const raw = await searchParams;
  const report = await getReceiptsReport(raw);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Recebimentos</h1>
        <p className="text-sm text-muted-foreground">Recebimentos válidos por data de recebimento. Pagamentos estornados ficam fora do total.</p>
      </div>
      <ReportNavigation active="receipts" filters={report.filters} />
      <ReportFilters key={JSON.stringify(raw)} action={RECEIPTS_PATH} {...filterFormValues(raw, report.filters, report.patient)} dateLabel="Período por data do recebimento" />

      {report.error ? (
        <Alert variant="destructive"><AlertDescription>{report.error}</AlertDescription></Alert>
      ) : (
        <>
          <ReportTotals items={[{ label: "Total recebido válido", value: report.totals.receivedCents }]} />
          <section aria-labelledby="recebimentos-lista" className="flex min-w-0 flex-col gap-3">
            <h2 id="recebimentos-lista" className="text-lg font-semibold">Recebimentos do período</h2>
            {report.items.length === 0 ? (
              <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Nenhum recebimento encontrado com esses filtros.</p>
            ) : (
              <ol className="flex min-w-0 flex-col gap-3">
                {report.items.map((payment) => (
                  <li key={payment.id} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/financeiro/${payment.chargeId}`} className="font-medium break-words underline-offset-4 hover:underline">{patientLabel(payment.patient)}</Link>
                        <p className="mt-1 text-sm break-words">{payment.description}</p>
                      </div>
                      <p className="font-semibold tabular-nums break-words">{formatBRL(payment.amountCents)}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">Recebido em {formatCivilDate(payment.receivedOn)}</p>
                    {payment.replacesPaymentId && <Badge variant="outline" className="self-start">Recebimento substituto</Badge>}
                    <Link href={`/financeiro/${payment.chargeId}`} className="self-start text-sm underline underline-offset-4">Ver cobrança</Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
          {report.filters && <ReportPagination path={RECEIPTS_PATH} filters={report.filters} page={report.page} pageCount={report.pageCount} total={report.total} noun={["recebimento", "recebimentos"]} />}
        </>
      )}
    </div>
  );
}
