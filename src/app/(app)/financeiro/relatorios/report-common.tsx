import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL, isPlausibleId, patientLabel } from "@/modules/financeiro/validation";

export const RECEIVABLES_PATH = "/financeiro/relatorios/contas-a-receber";
export const RECEIPTS_PATH = "/financeiro/relatorios/recebimentos";

type Filters = { patientId?: string; start?: string; end?: string; page: number };
type Patient = { id: string; fullName: string; status: "ATIVO" | "INATIVO" };
type Raw = Record<string, string | string[] | undefined>;

export function reportHref(path: string, filters: Filters | null, page = 1) {
  const query = new URLSearchParams();
  if (filters?.patientId) query.set("patientId", filters.patientId);
  if (filters?.start) query.set("start", filters.start);
  if (filters?.end) query.set("end", filters.end);
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

// Valores singulares servem só para corrigir o formulário após um erro. A consulta
// recebe o objeto original completo e decide se os parâmetros são válidos.
export function filterFormValues(raw: Raw, filters: Filters | null, patient: Patient | null) {
  const scalar = (name: string) => typeof raw[name] === "string" ? raw[name] : undefined;
  const date = (name: string) => {
    const value = scalar(name);
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  };
  const requestedPatient = filters?.patientId ?? scalar("patientId");
  return {
    initialPatient: patient
      ? { id: patient.id, label: patientLabel(patient) }
      : isPlausibleId(requestedPatient) && !/^\d+$/.test(requestedPatient)
        ? { id: requestedPatient, label: "Paciente informado no filtro (confira ou remova)" }
        : null,
    start: filters?.start ?? date("start"),
    end: filters?.end ?? date("end"),
  };
}

export function ReportNavigation({ active, filters }: { active: "receivables" | "receipts"; filters: Filters | null }) {
  return (
    <nav aria-label="Navegação financeira" className="flex flex-wrap gap-2">
      <Link href="/financeiro" className={buttonVariants({ variant: "outline", size: "sm" })}>Cobranças</Link>
      <Link href={reportHref(RECEIVABLES_PATH, filters)} aria-current={active === "receivables" ? "page" : undefined} className={buttonVariants({ variant: active === "receivables" ? "secondary" : "outline", size: "sm" })}>Contas a receber</Link>
      <Link href={reportHref(RECEIPTS_PATH, filters)} aria-current={active === "receipts" ? "page" : undefined} className={buttonVariants({ variant: active === "receipts" ? "secondary" : "outline", size: "sm" })}>Recebimentos</Link>
    </nav>
  );
}

export function ReportTotals({ items }: { items: { label: string; value: bigint }[] }) {
  return (
    <section aria-labelledby="relatorio-totais" className="flex flex-col gap-3">
      <div>
        <h2 id="relatorio-totais" className="text-lg font-semibold">Totais do filtro</h2>
        <p className="text-sm text-muted-foreground">Consideram todos os resultados, em todas as páginas.</p>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <Card key={item.label} className="min-w-0">
            <CardContent className="flex min-w-0 flex-col gap-2">
              <dl className="flex min-w-0 flex-col gap-2">
                <dt className="text-sm text-muted-foreground">{item.label}</dt>
                <dd className="text-xl font-semibold tabular-nums break-words">{formatBRL(item.value)}</dd>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function ReportPagination({ path, filters, page, pageCount, total, noun }: {
  path: string;
  filters: Filters;
  page: number;
  pageCount: number;
  total: number;
  noun: [string, string];
}) {
  return (
    <nav aria-label="Paginação do relatório" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">{total} {noun[total === 1 ? 0 : 1]} · página {page} de {pageCount}</p>
      <div className="flex flex-wrap gap-2">
        {page > 1 && <Link href={reportHref(path, filters, page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Anterior</Link>}
        {page < pageCount && <Link href={reportHref(path, filters, page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Próxima</Link>}
      </div>
    </nav>
  );
}

export function MoneyItem({ label, cents }: { label: string; cents: bigint }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums break-words">{formatBRL(cents)}</dd>
    </div>
  );
}
