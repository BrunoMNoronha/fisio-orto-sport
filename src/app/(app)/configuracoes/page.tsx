import type { Metadata } from "next";
import { CLINIC_TIMEZONE } from "@/modules/agenda/validation";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { getSettingsForPanel } from "@/modules/configuracoes/queries";
import { currentDevDataAvailability } from "@/modules/dados-ficticios/guard";
import { getDevDataPreview } from "@/modules/dados-ficticios/queries";
import { DevDataSection } from "./dev-data-section";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Configurações — TechLab+ Fisio OrtoSport" };

// Painel de configurações da clínica (issue #63): só quem tem `configuracoes:ler` (Administrador).
export default async function ConfiguracoesPage() {
  const actor = await requirePermission("configuracoes:ler");
  const settings = await getSettingsForPanel();
  const { version, updatedAt, updatedByName, ...values } = settings;
  // Seção de desenvolvimento (issue #73): só com o ambiente habilitado e para Administrador.
  const devData = currentDevDataAvailability();
  const devPreview = devData.enabled && actor.role === "ADMIN" ? await getDevDataPreview() : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Dados da clínica e preferências da agenda e das impressões. As mudanças valem para novos agendamentos e
          documentos gerados depois de salvar; nada já registrado é recalculado.
        </p>
      </div>
      <SettingsForm
        initial={values}
        version={version}
        lastChange={updatedAt ? { at: updatedAt.toISOString(), by: updatedByName } : null}
        canManage={can(actor.role, "configuracoes:gerir")}
        timezone={CLINIC_TIMEZONE}
        links={{ users: can(actor.role, "usuarios:ler"), audit: can(actor.role, "auditoria:ler") }}
      />
      {devData.enabled && devPreview && <DevDataSection preview={devPreview} target={devData.target.label} />}
    </div>
  );
}
