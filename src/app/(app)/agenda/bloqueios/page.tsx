import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelectOption } from "@/components/ui/native-select";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { UPCOMING_BLOCKS_LIMIT, listProfessionals, listUpcomingBlocks } from "@/modules/agenda/queries";
import { firstParam } from "@/modules/pacientes/validation";
import { AutoSubmitSelect } from "../auto-submit-select";
import { formatDateTime } from "../format";
import { RemoveBlockForm } from "./remove-block-form";

export const metadata: Metadata = { title: "Bloqueios da agenda — TechLab+ Fisio OrtoSport" };

// Bloqueios ativos que ainda não terminaram (MEL-02). Removidos ficam no banco, fora desta lista.
export default async function BloqueiosPage({ searchParams }: PageProps<"/agenda/bloqueios">) {
  const actor = await requirePermission("agenda:ler");
  const canManage = can(actor.role, "agenda:gerir");
  const professionalId = firstParam((await searchParams).professionalId)?.trim() || undefined;
  const [blocks, professionals] = await Promise.all([
    listUpcomingBlocks({ professionalId }),
    listProfessionals(),
  ]);
  const newQuery = professionalId ? `?${new URLSearchParams({ professionalId })}` : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-2xl font-semibold tracking-tight">Bloqueios da agenda</h1>
        <div className="ml-auto flex gap-3">
          <Link href="/agenda" className={buttonVariants({ variant: "outline" })}>
            Voltar à agenda
          </Link>
          {canManage && (
            <Link href={`/agenda/bloqueios/novo${newQuery}`} className={buttonVariants()}>
              <PlusIcon />
              Novo bloqueio
            </Link>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Não se agenda sobre um bloqueio. Um bloqueio só pode ser criado se o profissional não tiver agendamentos
        ativos no período.
      </p>

      <form role="search" method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-col gap-2">
          <Label htmlFor="bloqueios-profissional">Profissional</Label>
          <AutoSubmitSelect
            id="bloqueios-profissional"
            name="professionalId"
            defaultValue={professionalId ?? ""}
            className="w-full"
          >
            <NativeSelectOption value="">Todos</NativeSelectOption>
            {professionals.map((professional) => (
              <NativeSelectOption key={professional.id} value={professional.id}>
                {professional.name}
              </NativeSelectOption>
            ))}
          </AutoSubmitSelect>
        </div>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {blocks.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground shadow-xs">
          Nenhum bloqueio em vigor ou futuro.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {blocks.map((block) => {
            const period = `${formatDateTime(block.startsAt)} até ${formatDateTime(block.endsAt)}`;
            return (
              <li key={block.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="tabular-nums">{period}</span>
                <span className="flex-1 font-medium">{block.professional.name}</span>
                {block.reason && <span className="text-muted-foreground">{block.reason}</span>}
                <span className="text-xs text-muted-foreground">
                  Criado por {block.createdBy.name} em {formatDateTime(block.createdAt)}
                </span>
                {canManage && <RemoveBlockForm id={block.id} label={`${block.professional.name}, ${period}`} />}
              </li>
            );
          })}
        </ul>
      )}
      {blocks.length === UPCOMING_BLOCKS_LIMIT && (
        <p className="text-sm text-muted-foreground">
          Mostrando os {UPCOMING_BLOCKS_LIMIT} primeiros. Filtre por profissional para ver os demais.
        </p>
      )}
    </div>
  );
}
