import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toLocalDate, toLocalTime } from "@/modules/agenda/validation";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_RESULT_LABELS,
  AUDIT_RETENTION_DAYS,
} from "@/modules/auditoria/events";
import { listAuditLogs, listAuditUserOptions } from "@/modules/auditoria/queries";
import { auditFiltersSchema } from "@/modules/auditoria/validation";
import { requirePermission } from "@/modules/auth/dal";
import { ROLE_LABELS } from "@/modules/auth/permissions";
import { firstParam } from "@/modules/pacientes/validation";

export const metadata: Metadata = { title: "Auditoria — TechLab+ Fisio OrtoSport" };

function formatInstant(instant: Date) {
  const [y, m, d] = toLocalDate(instant).split("-");
  return `${d}/${m}/${y} ${toLocalTime(instant)}`;
}

export default async function AuditoriaPage({ searchParams }: PageProps<"/usuarios/auditoria">) {
  await requirePermission("auditoria:ler");

  const raw = await searchParams;
  const filters = auditFiltersSchema.parse({
    userId: firstParam(raw.userId),
    action: firstParam(raw.action),
    from: firstParam(raw.from),
    to: firstParam(raw.to),
    page: firstParam(raw.page),
  });
  const [{ items, total, page, pageCount }, users] = await Promise.all([
    listAuditLogs(filters),
    listAuditUserOptions(),
  ]);
  const names = new Map(users.map((user) => [user.id, user.name]));
  // Conta excluída (issue #76): o evento continua, identificado pelo início do id.
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? `Usuário excluído (${id.slice(0, 8)}…)`) : "—");
  const filtered = Boolean(filters.userId || filters.action || filters.from || filters.to);

  function pageHref(target: number) {
    const query = new URLSearchParams();
    if (filters.userId) query.set("userId", filters.userId);
    if (filters.action) query.set("action", filters.action);
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    if (target > 1) query.set("page", String(target));
    const qs = query.toString();
    return qs ? `/usuarios/auditoria?${qs}` : "/usuarios/auditoria";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Logins, acessos negados e alterações de usuários dos últimos {AUDIT_RETENTION_DAYS} dias. Registros mais
          antigos são removidos automaticamente.
        </p>
      </div>

      <form role="search" method="get" className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex min-w-48 flex-col gap-2">
          <Label htmlFor="auditoria-usuario">Usuário</Label>
          <NativeSelect id="auditoria-usuario" name="userId" defaultValue={filters.userId ?? ""}>
            <NativeSelectOption value="">Todos</NativeSelectOption>
            {users.map((user) => (
              <NativeSelectOption key={user.id} value={user.id}>
                {user.name} ({user.email})
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex min-w-48 flex-col gap-2">
          <Label htmlFor="auditoria-acao">Ação</Label>
          <NativeSelect id="auditoria-acao" name="action" defaultValue={filters.action ?? ""}>
            <NativeSelectOption value="">Todas</NativeSelectOption>
            {AUDIT_ACTIONS.map((action) => (
              <NativeSelectOption key={action} value={action}>
                {AUDIT_ACTION_LABELS[action]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="auditoria-de">De</Label>
          <Input id="auditoria-de" name="from" type="date" defaultValue={filters.from ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="auditoria-ate">Até</Label>
          <Input id="auditoria-ate" name="to" type="date" defaultValue={filters.to ?? ""} />
        </div>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {items.length === 0 ? (
        <p className="rounded-xl border bg-card shadow-xs px-4 py-8 text-center text-sm text-muted-foreground">
          {filtered ? "Nenhum registro encontrado com esses filtros." : "Nenhum registro de auditoria no período."}
        </p>
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data e hora</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Quem</TableHead>
                <TableHead className="hidden md:table-cell">Alvo</TableHead>
                <TableHead className="hidden md:table-cell">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap">{formatInstant(entry.createdAt)}</TableCell>
                  <TableCell>
                    {AUDIT_ACTION_LABELS[entry.action]}
                    {entry.details && <span className="block text-xs text-muted-foreground">{entry.details}</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.result === "SUCESSO" ? "secondary" : "outline"}>
                      {AUDIT_RESULT_LABELS[entry.result]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {entry.actorId ? nameOf(entry.actorId) : entry.action.startsWith("CLI_") ? "Terminal (db:admin)" : "—"}
                    {entry.actorRole && (
                      <span className="block text-xs text-muted-foreground">{ROLE_LABELS[entry.actorRole]}</span>
                    )}
                    <span className="block text-xs text-muted-foreground md:hidden">
                      Alvo: {nameOf(entry.targetUserId)}
                      {entry.ip ? ` · IP ${entry.ip}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {nameOf(entry.targetUserId)}
                    {entry.emailHash && !entry.targetUserId && (
                      <span className="block text-xs text-muted-foreground">E-mail não cadastrado ou inválido</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{entry.ip ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <nav aria-label="Paginação" className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {total} {total === 1 ? "registro" : "registros"} · página {Math.min(page, pageCount)} de {pageCount}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={pageHref(Math.min(page - 1, pageCount))} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Anterior
            </Link>
          )}
          {page < pageCount && (
            <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Próxima
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
