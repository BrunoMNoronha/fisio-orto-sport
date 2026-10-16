import { NativeActionButton } from "@/components/informative-help";
import Link from "next/link";
export { CatalogPagination as Pagination, dateLabel } from "../configuracoes/catalog-ui";
export function Search({ label, q, hidden = {} }: { label: string; q?: string; hidden?: Record<string,string> }) {
  return <form className="flex flex-wrap gap-2">{Object.entries(hidden).map(([k,v]) => <input type="hidden" key={k} name={k} value={v} />)}
    <input className="min-w-0 flex-1 rounded border p-2" name="q" maxLength={120} defaultValue={q} aria-label={label} />
    <NativeActionButton help="Atualiza a consulta usando os filtros informados, sem alterar os registros." className="underline" type="submit">Buscar</NativeActionButton></form>;
}
export const dateValue = (v: Date | null) => v?.toISOString().slice(0,10) ?? "";
export function Notice() { return <p className="rounded border p-3 text-sm">Cobertura e autorização são registros para faturamento. Pendências não bloqueiam atendimento clínico. Operadora piloto e volume permanecem pendentes.</p>; }
export function Validity({ active, startsOn, endsOn }: { active: boolean; startsOn: Date; endsOn: Date | null }) {
  const today = new Intl.DateTimeFormat("sv-SE",{ timeZone:"America/Sao_Paulo" }).format(new Date());
  const start = dateValue(startsOn), end = dateValue(endsOn);
  return <p className="text-sm" role="status">{!active ? "Inativo/cancelado" : today < start ? "Vigência ainda não iniciada" : end && today > end ? "Vencido na data de hoje; pode ter sido válido na execução" : "Dentro da vigência na data de hoje"}.
    {" "}A elegibilidade é verificada pela data de execução informada.</p>;
}
export function AdminBack() { return <Link className="underline text-sm" href="/administrativo">Voltar ao administrativo</Link>; }
export const eligibilityLabels: Record<string,string> = {
  APTA:"Apta para consumo na conferência de produção.", DISPENSADA:"Autorização dispensada expressamente pelo contrato/procedimento.",
  ENTRADA_INVALIDA:"Informe data e quantidade válidas.", COBERTURA_INCOMPATIVEL:"Cobertura não pertence ao paciente.",
  INATIVO:"Há cadastro inativo.", COBERTURA_FORA_DA_VIGENCIA:"Cobertura fora da vigência na execução.",
  PROCEDIMENTO_INCOMPATIVEL:"Procedimento não pertence ao contrato.", REGRA_PENDENTE:"Exigência de autorização pendente de confirmação pelo administrador.",
  AUTORIZACAO_PENDENTE:"Selecione uma autorização recebida para este procedimento.", AUTORIZACAO_INCOMPATIVEL:"Autorização incompatível com a cobertura/procedimento.",
  AUTORIZACAO_CANCELADA:"Autorização ou item cancelado/inativo.", AUTORIZACAO_FORA_DA_VIGENCIA:"Autorização fora da vigência na execução.", SALDO_INSUFICIENTE:"Saldo autorizado insuficiente.",
};
