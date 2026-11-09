// Indicadores financeiros do mês na página inicial. Server Component: lê o banco e entrega os
// valores já formatados; nenhum bigint cruza para o cliente.
import Link from "next/link";
import { AlertTriangleIcon, ArrowRightIcon, BanknoteIcon, HourglassIcon, ReceiptTextIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays } from "@/modules/agenda/validation";
import { formatDelta, formatMonthLabel, lastDayOf, monthWindow, percentDelta } from "@/modules/financeiro/kpi-math";
import { getFinanceKpis, type FinanceKpis as FinanceKpisData } from "@/modules/financeiro/kpi-queries";
import { formatBRL } from "@/modules/financeiro/validation";

type KpiCard = {
  key: string;
  label: string;
  value: string;
  note: string;
  href: string;
  icon: LucideIcon;
  alert: boolean;
};

const KPI_GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";
const KPI_COUNT = 4;

export function buildFinanceKpiCards(kpis: FinanceKpisData): KpiCard[] {
  const { start } = monthWindow(kpis.month);
  const end = lastDayOf(kpis.month);
  const yesterday = addDays(kpis.today, -1);
  const zero = BigInt(0);
  return [
    {
      key: "cobrado",
      label: "Cobrado no mês",
      value: formatBRL(kpis.chargedCents),
      note: formatDelta(percentDelta(kpis.chargedCents, kpis.previousChargedCents)),
      href: "/financeiro",
      icon: ReceiptTextIcon,
      alert: false,
    },
    {
      key: "recebido",
      label: "Recebido no mês",
      value: formatBRL(kpis.receivedCents),
      note: formatDelta(percentDelta(kpis.receivedCents, kpis.previousReceivedCents)),
      href: `/financeiro/relatorios/recebimentos?start=${start}&end=${end}`,
      icon: BanknoteIcon,
      alert: false,
    },
    {
      key: "a-receber",
      label: "A receber",
      value: formatBRL(kpis.openCents),
      note: "Saldo em aberto das cobranças ativas",
      href: "/financeiro/relatorios/contas-a-receber",
      icon: HourglassIcon,
      alert: false,
    },
    {
      key: "vencido",
      label: "Vencido",
      value: formatBRL(kpis.overdueCents),
      note: "Vencimento anterior a hoje",
      href: `/financeiro/relatorios/contas-a-receber?end=${yesterday}`,
      icon: AlertTriangleIcon,
      alert: kpis.overdueCents > zero,
    },
  ];
}

function FinanceKpiCard({ card }: { card: KpiCard }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader>
        <CardDescription>{card.label}</CardDescription>
        <CardTitle className={`text-2xl font-semibold tabular-nums break-words${card.alert ? " text-destructive" : ""}`}>
          {card.value}
        </CardTitle>
        <CardAction>
          <div
            className={`flex size-10 items-center justify-center rounded-xl ${card.alert ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}
          >
            <card.icon className="size-5" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{card.note}</p>
        <Link
          href={card.href}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Ver detalhes <ArrowRightIcon className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}

export async function FinanceKpis() {
  const kpis = await getFinanceKpis();
  if (!kpis) return null;
  const cards = buildFinanceKpiCards(kpis);
  return (
    <section aria-labelledby="financeiro-kpis-titulo" className="flex flex-col gap-3" data-tour="financeiro-kpis">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="financeiro-kpis-titulo" className="text-lg font-semibold">
          Financeiro de {formatMonthLabel(kpis.month)}
        </h2>
        <Link href="/financeiro" className="text-sm text-muted-foreground hover:text-foreground">
          Abrir financeiro
        </Link>
      </div>
      <div className={KPI_GRID}>
        {cards.map((card) => (
          <FinanceKpiCard key={card.key} card={card} />
        ))}
      </div>
    </section>
  );
}

export function FinanceKpisSkeleton() {
  return (
    <section role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Carregando indicadores financeiros…</span>
      <Skeleton className="h-6 w-56" />
      <div className={KPI_GRID}>
        {Array.from({ length: KPI_COUNT }, (_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-1 h-8 w-36" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
