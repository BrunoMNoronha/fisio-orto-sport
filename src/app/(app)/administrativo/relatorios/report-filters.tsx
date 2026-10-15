"use client";
import { useState } from "react";
import { PatientCombobox } from "../../agenda/patient-combobox";
import { searchAdministrativeReportOptions } from "@/modules/administrativo/report-actions";
import { AUTHORIZATION_STATES, PRODUCTION_STATES, type AdministrativeReportKind } from "@/modules/administrativo/report-validation";
import type { ReportOptionKey } from "@/modules/administrativo/report-options";
const fields = [
  ["patientId", "Paciente"], ["operatorId", "Operadora"], ["contractId", "Contrato"],
  ["procedureId", "Procedimento"], ["professionalId", "Profissional"], ["authorizationId", "Autorização"],
] as const;
const searches = Object.fromEntries(fields.map(([key]) => [key, searchAdministrativeReportOptions.bind(null, key)])) as Record<ReportOptionKey, (query: string) => ReturnType<typeof searchAdministrativeReportOptions>>;
function Selection({ name, label, value }: { name: ReportOptionKey; label: string; value: { id: string; label: string } | null }) {
  const [selected, setSelected] = useState(value);
  return <div><PatientCombobox name={name} label={label} value={selected} onChange={setSelected} search={searches[name]} texts={{ noun: label.toLowerCase(), plural: label, listLabel: label }} />
    {selected && <button className="text-sm underline" type="button" onClick={() => setSelected(null)}>Remover {label.toLowerCase()}</button>}</div>;
}
export function ReportFilters({ kind, values, labels }: { kind: AdministrativeReportKind; values: Record<string, string | undefined>; labels: Record<string, string> }) {
  return <form className="grid gap-4 rounded border p-4 sm:grid-cols-2 lg:grid-cols-3" method="get">
    {fields.filter(([key]) => kind === 'autorizacoes' ? key !== 'professionalId' : key !== 'authorizationId').map(([key, label]) => <Selection key={key + String(values[key])} name={key} label={label} value={values[key] ? { id: values[key]!, label: labels[key] ?? 'Filtro informado (revise a seleção)' } : null} />)}
    <label>Data inicial<input className="block w-full rounded border p-2" type="date" name="start" defaultValue={values.start} min="2000-01-01" max="2100-12-31" /></label>
    <label>Data final<input className="block w-full rounded border p-2" type="date" name="end" defaultValue={values.end} min="2000-01-01" max="2100-12-31" /></label>
    <label>Estado<select className="block w-full rounded border p-2" name="state" defaultValue={values.state ?? ''}><option value="">Todos</option>{(kind === 'autorizacoes' ? AUTHORIZATION_STATES : PRODUCTION_STATES).map(s => <option key={s}>{s}</option>)}</select></label>
    <div className="flex items-end gap-4"><button className="rounded border px-4 py-2" type="submit">Aplicar filtros</button><a className="underline" href={`/administrativo/relatorios/${kind}`}>Limpar filtros</a></div>
  </form>;
}
