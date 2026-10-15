import type { Prisma } from "@/generated/prisma/client";

const labels: Record<string, string> = { name: "Nome", registrationAns: "Registro ANS", active: "Ativo",
  homologationChannel: "Canal de homologação", monthlySessions: "Sessões estimadas/mês", closingIntervalDays: "Intervalo de fechamento (dias)", maxGuides: "Guias/lote", maxItems: "Itens/lote", maxXmlBytes: "XML (bytes)", maxExportRows: "Linhas/exportação",
  providerCode: "Código da clínica", cnes: "CNES", tissVersion: "Versão TISS", manualReference: "Manual/canal",
  tableCode: "Código da tabela", code: "Código do procedimento", amountCents: "Valor em centavos",
  startsOn: "Início da vigência", endsOn: "Fim da vigência", purpose: "Atuação", councilCode: "Código do conselho",
  councilNumber: "Número no conselho", councilState: "UF do conselho", occupationCode: "CBO",
  beneficiaryName: "Beneficiário", cardNumber: "Carteirinha", planName: "Plano", number: "Autorização",
  accessCode: "Senha da autorização", issuedOn: "Data de emissão", authorizedQuantity: "Quantidade autorizada" };

export function ConfigHistory({ changes }: { changes: {
  version: number; reason: string; snapshot: Prisma.JsonValue; createdAt: Date; actor: { name: string };
}[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Histórico de configurações</h2>
      <p className="text-sm text-muted-foreground">Últimas dez alterações, com os dados registrados em cada versão. As versões anteriores permanecem preservadas.</p>
      {changes.map((change) => (
        <details key={change.version} className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm">Versão {change.version} — {change.actor.name} — {change.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</summary>
          <p className="my-2 break-words text-sm">{change.reason}</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries((change.snapshot ?? {}) as Record<string, unknown>).filter(([key]) => key in labels).map(([key, value]) => (
              <div key={key}><dt className="text-muted-foreground">{labels[key]}</dt><dd className="break-words">{value === null ? "Pendente" : typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value)}</dd></div>
            ))}
          </dl>
        </details>
      ))}
    </section>
  );
}
