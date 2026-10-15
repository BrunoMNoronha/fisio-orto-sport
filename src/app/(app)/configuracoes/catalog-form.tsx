"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { saveProcedure, saveTariff, saveProfessional } from "@/modules/administrativo/catalog-actions";
import { PROFESSIONAL_PURPOSES, STATES } from "@/modules/administrativo/catalog-validation";

type Field = { name: string; label: string; max?: number; type?: "date"; required?: boolean; immutable?: boolean };
const fields: Record<"procedure" | "tariff" | "professional", Field[]> = {
  procedure: [{ name: "name", label: "Nome do procedimento", max: 160, required: true },
    { name: "tableCode", label: "Código da tabela", max: 10, required: true, immutable: true },
    { name: "code", label: "Código do procedimento", max: 30, required: true, immutable: true }],
  tariff: [{ name: "amount", label: "Valor unitário (R$)", required: true, max: 20 },
    { name: "startsOn", label: "Início da vigência", type: "date", required: true },
    { name: "endsOn", label: "Fim da vigência (opcional)", type: "date" }],
  professional: [{ name: "name", label: "Nome do profissional", max: 120, required: true },
    { name: "councilCode", label: "Código do conselho (dois dígitos)", max: 2 },
    { name: "councilNumber", label: "Número no conselho", max: 20 },
    { name: "occupationCode", label: "CBO (seis dígitos)", max: 6 }],
};
const actions = { procedure: saveProcedure, tariff: saveTariff, professional: saveProfessional };
export function CatalogForm({ kind, id, requestId, version, parentId, initial, cancelHref, users = [] }: {
  kind: keyof typeof fields; id: string; requestId: string; version: number; parentId?: string;
  initial: Record<string, string>; cancelHref: string; users?: { id: string; name: string }[];
}) {
  const [values, setValues] = useState(initial);
  const [state, action, pending] = useActionState(actions[kind], undefined);
  const errors = state?.fieldErrors;
  const update = (key: string, value: string) => setValues((old) => ({ ...old, [key]: value }));
  function feedback(key: string) { return errors?.[key] && <p id={`${key}-error`} className="text-sm text-destructive">{errors[key][0]}</p>; }
  function select(key: string, label: string, options: [string, string][]) {
    return <div className="flex flex-col gap-2"><Label htmlFor={key}>{label}</Label>
      <NativeSelect id={key} name={key} value={values[key] ?? ""} onChange={(e) => update(key, e.target.value)}
        aria-invalid={Boolean(errors?.[key])} aria-describedby={errors?.[key] ? `${key}-error` : undefined}>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </NativeSelect>{feedback(key)}</div>;
  }
  return <form action={action} className="flex flex-col gap-5">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="requestId" value={requestId} />
    <input type="hidden" name="expectedVersion" value={version} />
    {parentId && <input type="hidden" name={kind === "procedure" ? "contractId" : "procedureId"} value={parentId} />}
    {state?.error && <p role="alert" className="rounded border border-destructive p-3 text-sm">{state.error}</p>}
    {kind === "procedure" && <p className="text-sm text-muted-foreground">Tabela e código devem corresponder ao contrato e preservam zeros. Após salvar, ficam fixos; para corrigir, inative e crie outro cadastro.</p>}
    {kind === "tariff" && <p className="text-sm text-muted-foreground">As duas datas estão incluídas na vigência. Sem data final, a tarifa vale por prazo indeterminado. Não são permitidos períodos ativos sobrepostos.</p>}
    {kind === "professional" && <>
      <p className="text-sm text-muted-foreground">Dados de conselho, UF e CBO podem ficar pendentes. O vínculo com usuário é opcional e não cria acesso ao sistema.</p>
      {select("purpose", "Atuação", Object.entries(PROFESSIONAL_PURPOSES))}
      {select("userId", "Usuário fisioterapeuta (opcional)", [["", "Sem vínculo"], ...users.map((u): [string,string] => [u.id, u.name])])}
    </>}
    {fields[kind].map((field) => <div key={field.name} className="flex flex-col gap-2">
      <Label htmlFor={field.name}>{field.label}{field.required ? " *" : ""}</Label>
      <Input id={field.name} name={field.name} type={field.type ?? "text"} maxLength={field.max} required={field.required}
        readOnly={Boolean(version && field.immutable)} value={values[field.name] ?? ""}
        min={field.type === "date" ? "2000-01-01" : undefined} max={field.type === "date" ? "2100-12-31" : undefined}
        aria-invalid={Boolean(errors?.[field.name])} aria-describedby={errors?.[field.name] ? `${field.name}-error` : undefined}
        onInput={field.type === "date" ? (e) => update(field.name, e.currentTarget.value) : undefined}
        onChange={(e) => update(field.name, e.target.value)} />{feedback(field.name)}
    </div>)}
    {kind === "professional" && select("councilState", "UF do conselho", [["","Pendente"], ...STATES.map((s): [string,string] => [s,s])])}
    {select("active", "Situação", [["true","Ativo"],["false","Inativo"]])}
    <div className="flex flex-col gap-2"><Label htmlFor="reason">Motivo do registro ou alteração *</Label>
      <Input id="reason" name="reason" value={values.reason ?? ""} required maxLength={300} onChange={(e) => update("reason",e.target.value)}
        aria-invalid={Boolean(errors?.reason)} aria-describedby={errors?.reason ? "reason-error" : undefined} />{feedback("reason")}</div>
    <div className="flex flex-wrap gap-2"><Button disabled={pending} type="submit">{pending ? "Salvando…" : "Salvar"}</Button>
      <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>Voltar</Link></div>
  </form>;
}
