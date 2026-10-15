"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { saveCoverage, saveAuthorization, saveAuthorizationItem, saveProcedureRule } from "@/modules/administrativo/beneficiary-actions";
type Field = { name: string; label: string; max?: number; required?: boolean; date?: boolean; number?: boolean };
const fields = {
  coverage: [{ name: "beneficiaryName", label: "Nome do beneficiário", max: 120, required: true },
    { name: "cardNumber", label: "Carteirinha", max: 60, required: true },{ name: "planName", label: "Nome do plano (opcional)", max: 120 },
    { name: "startsOn", label: "Início da cobertura", date: true, required: true },{ name: "endsOn", label: "Fim da cobertura (opcional)", date: true }],
  authorization: [{ name: "number", label: "Número da autorização recebida", max: 60, required: true },
    { name: "accessCode", label: "Senha da autorização (opcional)", max: 60 },{ name: "issuedOn", label: "Data de emissão", date: true, required: true },
    { name: "startsOn", label: "Início da autorização", date: true, required: true },{ name: "endsOn", label: "Fim da autorização", date: true, required: true }],
  item: [{ name: "authorizedQuantity", label: "Quantidade autorizada (unidades do procedimento)", number: true, required: true }],
  rule: [{ name: "reference", label: "Referência contratual ou manual", max: 300, required: true }],
} satisfies Record<string,Field[]>;
const actions = { coverage: saveCoverage, authorization: saveAuthorization, item: saveAuthorizationItem, rule: saveProcedureRule };
export function BeneficiaryForm({ kind, id, version, requestId, hidden, initial, cancelHref }: {
  kind: keyof typeof fields; id: string; version: number; requestId: string; hidden: Record<string,string>;
  initial: Record<string,string>; cancelHref: string;
}) {
  const [values,setValues] = useState(initial);
  const [state,action,pending] = useActionState(actions[kind],undefined);
  const errors = state?.fieldErrors;
  const domId = (key: string) => `${kind}-${id}-${key}`;
  const update = (key: string, value: string) => setValues((old) => ({ ...old,[key]:value }));
  const feedback = (key: string) => errors?.[key]?.length ? <p id={`${domId(key)}-error`} className="text-sm text-destructive">{errors[key][0]}</p> : null;
  return <form action={action} className="flex flex-col gap-4">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="expectedVersion" value={version} />
    {Object.entries(hidden).map(([name,value]) => <input key={name} type="hidden" name={name} value={value} />)}
    {state?.error && <p role="alert" className="rounded border border-destructive p-3 text-sm">{state.error}</p>}
    {kind === "rule" && <div className="flex flex-col gap-2"><Label htmlFor={domId("mode")}>Exigência de autorização</Label>
      <NativeSelect id={domId("mode")} name="mode" value={values.mode ?? "PENDENTE"} onInput={(e) => update("mode",e.currentTarget.value)} onChange={(e) => update("mode",e.target.value)}>
        <option value="PENDENTE">Pendente de confirmação</option><option value="EXIGIDA">Exigida</option><option value="DISPENSADA">Dispensada expressamente</option>
      </NativeSelect>{feedback("mode")}</div>}
    {(fields[kind] as Field[]).map((f) => <div key={f.name} className="flex flex-col gap-2"><Label htmlFor={domId(f.name)}>{f.label}{f.required ? " *" : ""}</Label>
      <Input id={domId(f.name)} name={f.name} value={values[f.name] ?? ""} required={f.required} maxLength={f.max} type={f.date ? "date" : f.number ? "number" : "text"}
        min={f.date ? "2000-01-01" : f.number ? 1 : undefined} max={f.date ? "2100-12-31" : f.number ? 2147483647 : undefined} step={f.number ? 1 : undefined}
        aria-invalid={Boolean(errors?.[f.name])} aria-describedby={errors?.[f.name] ? `${domId(f.name)}-error` : undefined}
        onInput={f.date ? (e) => update(f.name,e.currentTarget.value) : undefined} onChange={(e) => update(f.name,e.target.value)} />{feedback(f.name)}</div>)}
    {kind !== "rule" && <div className="flex flex-col gap-2"><Label htmlFor={domId("active")}>Situação</Label>
      <NativeSelect id={domId("active")} name="active" value={values.active ?? "true"} onInput={(e) => update("active",e.currentTarget.value)} onChange={(e) => update("active",e.target.value)}>
        <option value="true">{kind === "authorization" ? "Recebida / ativa" : "Ativo"}</option><option value="false">{kind === "authorization" ? "Cancelada" : "Inativo"}</option>
      </NativeSelect>{feedback("active")}</div>}
    <div className="flex flex-col gap-2"><Label htmlFor={domId("reason")}>Motivo do registro ou alteração *</Label>
      <Input id={domId("reason")} name="reason" value={values.reason ?? ""} required maxLength={300} aria-invalid={Boolean(errors?.reason)}
        aria-describedby={errors?.reason ? `${domId("reason")}-error` : undefined} onChange={(e) => update("reason",e.target.value)} />{feedback("reason")}</div>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
      <Link className={buttonVariants({variant:"outline"})} href={cancelHref}>Voltar</Link></div>
  </form>;
}
