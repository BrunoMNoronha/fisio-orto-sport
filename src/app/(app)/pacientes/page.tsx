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
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { listPatients } from "@/modules/pacientes/queries";
import {
  PATIENT_STATUSES,
  PATIENT_STATUS_LABELS,
  firstParam,
  formatPhone,
  listPatientsSchema,
} from "@/modules/pacientes/validation";
import { formatAge, formatDate } from "./format";

export const metadata: Metadata = { title: "Pacientes — TechLab+ Fisio OrtoSport" };

export default async function PacientesPage({ searchParams }: PageProps<"/pacientes">) {
  const actor = await requirePermission("pacientes:ler");
  const canManage = can(actor.role, "pacientes:gerir");

  const raw = await searchParams;
  const params = listPatientsSchema.parse({
    q: firstParam(raw.q),
    status: firstParam(raw.status),
    page: firstParam(raw.page),
  });
  const { items, total, page, pageCount } = await listPatients(params);

  // A URL leva apenas nome, situação e página (nunca CPF).
  function pageHref(target: number) {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.status) query.set("status", params.status);
    if (target > 1) query.set("page", String(target));
    const qs = query.toString();
    return qs ? `/pacientes?${qs}` : "/pacientes";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Pacientes</h1>
          <p className="text-sm text-muted-foreground">Cadastro e contato dos pacientes da clínica.</p>
        </div>
        {canManage && (
          <Link href="/pacientes/novo" className={buttonVariants()}>
            Novo paciente
          </Link>
        )}
      </div>

      <form role="search" method="get" className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex min-w-56 flex-1 flex-col gap-2">
          <Label htmlFor="busca-nome">Buscar por nome</Label>
          <Input id="busca-nome" name="q" type="search" defaultValue={params.q ?? ""} maxLength={100} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="busca-status">Situação</Label>
          <NativeSelect id="busca-status" name="status" defaultValue={params.status ?? ""}>
            <NativeSelectOption value="">Todas</NativeSelectOption>
            {PATIENT_STATUSES.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {PATIENT_STATUS_LABELS[status]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {items.length === 0 ? (
        <p className="rounded-xl border bg-card shadow-xs px-4 py-8 text-center text-sm text-muted-foreground">
          {params.q || params.status ? "Nenhum paciente encontrado com esses filtros." : "Nenhum paciente cadastrado."}
        </p>
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden sm:table-cell">Nascimento</TableHead>
                <TableHead className="hidden sm:table-cell">Telefone</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell className="font-medium">
                    <Link href={`/pacientes/${patient.id}`} className="underline-offset-4 hover:underline">
                      {patient.fullName}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {formatDate(patient.birthDate)} ({formatAge(patient.birthDate)})
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{formatPhone(patient.phone)}</TableCell>
                  <TableCell>
                    <Badge variant={patient.status === "ATIVO" ? "secondary" : "outline"}>
                      {PATIENT_STATUS_LABELS[patient.status]}
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
          {total} {total === 1 ? "paciente" : "pacientes"} · página {Math.min(page, pageCount)} de {pageCount}
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
