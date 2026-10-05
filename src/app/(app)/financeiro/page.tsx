import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { getChargePatientFilter, listCharges } from "@/modules/financeiro/queries";
import {
  CHARGE_STATUSES,
  CHARGE_STATUS_LABELS,
  formatBRL,
  formatCivilDate,
  listChargesSchema,
  patientLabel,
} from "@/modules/financeiro/validation";
import { firstParam } from "@/modules/pacientes/validation";

export const metadata: Metadata = { title: "Financeiro — TechLab+ Fisio OrtoSport" };

export default async function FinanceiroPage({ searchParams }: PageProps<"/financeiro">) {
  const actor = await requirePermission("financeiro:ler");
  const canManage = can(actor.role, "financeiro:gerir");

  const raw = await searchParams;
  const params = listChargesSchema.parse({
    q: firstParam(raw.q),
    status: firstParam(raw.status),
    patientId: firstParam(raw.patientId),
    page: firstParam(raw.page),
  });
  const [{ items, total, page, pageCount }, filterPatient] = await Promise.all([
    listCharges(params),
    getChargePatientFilter(params.patientId),
  ]);
  const filtered = Boolean(params.q || params.status || params.patientId);

  // A URL leva só nome buscado, situação, paciente (id) e página.
  function href(overrides: { page?: number; patientId?: string | null }) {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.status) query.set("status", params.status);
    const patientId = overrides.patientId === undefined ? params.patientId : overrides.patientId;
    if (patientId) query.set("patientId", patientId);
    const target = overrides.page ?? 1;
    if (target > 1) query.set("page", String(target));
    const qs = query.toString();
    return qs ? `/financeiro?${qs}` : "/financeiro";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Cobranças manuais lançadas para os pacientes.</p>
        </div>
        {canManage && (
          <Link
            href={params.patientId ? `/financeiro/novo?patientId=${params.patientId}` : "/financeiro/novo"}
            className={buttonVariants()}
          >
            Nova cobrança
          </Link>
        )}
      </div>

      <form role="search" method="get" className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-xs">
        {params.patientId && <input type="hidden" name="patientId" value={params.patientId} />}
        <div className="flex min-w-56 flex-1 flex-col gap-2">
          <Label htmlFor="busca-paciente">Buscar por nome do paciente</Label>
          <Input id="busca-paciente" name="q" type="search" defaultValue={params.q ?? ""} maxLength={100} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="busca-situacao">Situação</Label>
          <NativeSelect id="busca-situacao" name="status" defaultValue={params.status ?? ""}>
            <NativeSelectOption value="">Todas</NativeSelectOption>
            {CHARGE_STATUSES.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {CHARGE_STATUS_LABELS[status]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {params.patientId && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Paciente:</span>
          <span className="font-medium">{filterPatient ? patientLabel(filterPatient) : "Paciente não encontrado"}</span>
          <Link href={href({ patientId: null })} className="underline underline-offset-4">
            Remover filtro do paciente
          </Link>
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-xs">
          {filtered ? "Nenhuma cobrança encontrada com esses filtros." : "Nenhuma cobrança lançada."}
        </p>
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead className="hidden md:table-cell">Descrição</TableHead>
                <TableHead className="hidden sm:table-cell">Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((charge) => (
                <TableRow key={charge.id}>
                  <TableCell className="font-medium whitespace-normal">
                    <Link href={`/financeiro/${charge.id}`} className="underline-offset-4 hover:underline">
                      {patientLabel(charge.patient)}
                    </Link>
                    <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                      Vence em {formatCivilDate(charge.dueDate)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-80 truncate md:table-cell" title={charge.description}>
                    {charge.description}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{formatCivilDate(charge.dueDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(charge.amountCents)}</TableCell>
                  <TableCell>
                    <Badge variant={charge.status === "ATIVA" ? "secondary" : "outline"}>
                      {CHARGE_STATUS_LABELS[charge.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <nav aria-label="Paginação" className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {total} {total === 1 ? "cobrança" : "cobranças"} · página {Math.min(page, pageCount)} de {pageCount}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={href({ page: Math.min(page - 1, pageCount) })} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Anterior
            </Link>
          )}
          {page < pageCount && (
            <Link href={href({ page: page + 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Próxima
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
