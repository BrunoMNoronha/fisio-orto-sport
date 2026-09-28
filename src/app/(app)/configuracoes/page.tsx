import type { Metadata } from "next";
import { CLINIC_TIMEZONE } from "@/modules/agenda/validation";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { getSettingsForPanel } from "@/modules/configuracoes/queries";
import { currentDevDataAvailability, currentDevResetAvailability } from "@/modules/dados-ficticios/guard";
import { getDevDataPreview } from "@/modules/dados-ficticios/queries";
import { getResetPreview } from "@/modules/manutencao/queries";
import { DevDataSection } from "./dev-data-section";
import { DevResetSection } from "./dev-reset-section";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Configurações — TechLab+ Fisio OrtoSport" };

// Painel de configurações da clínica (issue #63): só quem tem `configuracoes:ler` (Administrador).
// Em abas (#78); a aba Desenvolvimento só existe com alguma ferramenta habilitada no ambiente.
export default async function ConfiguracoesPage() {
  const actor = await requirePermission("configuracoes:ler");
  const settings = await getSettingsForPanel();
  const { version, updatedAt, updatedByName, ...values } = settings;
  // Ferramentas de desenvolvimento (#73, #78): cada uma com sua habilitação e só para Administrador.
  const isAdmin = actor.role === "ADMIN";
  const devData = currentDevDataAvailability();
  const devReset = currentDevResetAvailability();
  const [devPreview, resetPreview] = await Promise.all([
    devData.enabled && isAdmin ? getDevDataPreview() : null,
    devReset.enabled && isAdmin ? getResetPreview() : null,
  ]);
  const devPanel =
    devPreview || resetPreview ? (
      <>
        {devData.enabled && devPreview && <DevDataSection preview={devPreview} target={devData.target.label} />}
        {devReset.enabled && resetPreview && (
          <DevResetSection target={devReset.target.label} database={devReset.target.database} preview={resetPreview} />
        )}
      </>
    ) : null;

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
        devPanel={devPanel}
      />
    </div>
  );
}
