import { randomUUID } from "node:crypto";
import { requirePermission } from "@/modules/auth/dal";
import { ConfigForm } from "../config-form";

export default async function NovaOperadoraPage() {
  await requirePermission("administrativo:configurar");
  return <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
    <h1 className="text-2xl font-semibold">Nova operadora</h1>
    <p className="text-sm text-muted-foreground">O registro ANS pode ser preenchido depois. Não há seleção automática de operadora piloto.</p>
    <ConfigForm kind="operator" id={randomUUID()} requestId={randomUUID()} expectedVersion={0}
      initial={{ name: "", registrationAns: "", active: "true", reason: "Cadastro inicial" }} cancelHref="/configuracoes/operadoras" />
  </div>;
}
