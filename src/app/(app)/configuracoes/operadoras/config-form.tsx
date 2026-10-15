"use client";

import Link from "next/link";
import { CONTRACT_DEFAULTS } from "@/modules/administrativo/contract-defaults";
import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { saveOperator, saveContract } from "@/modules/administrativo/actions";

type Field = { name: string; label: string; max: number; hint?: string; required?: boolean; numeric?: boolean; limit?: number };
const operatorFields: Field[] = [
  { name: "name", label: "Nome da operadora", max: 120, required: true },
  { name: "registrationAns", label: "Registro ANS", max: 6, numeric: true, hint: "Seis dígitos, preservando zeros. Pode ficar pendente." },
];
const contractFields: Field[] = [
  { name: "homologationChannel", label: "Canal de homologação", max: 300, hint: "Portal, contato ou endereço. Não informe credenciais." },
  { name: "monthlySessions", label: "Sessões estimadas por mês", max: 10, numeric: true, limit: 1000000, required: true },
  { name: "closingIntervalDays", label: "Intervalo de fechamento (dias)", max: 10, numeric: true, limit: 31, required: true },
  { name: "maxGuides", label: "Máximo de guias por lote", max: 10, numeric: true, limit: 10000, required: true },
  { name: "maxItems", label: "Máximo de itens por lote", max: 10, numeric: true, limit: 100000, required: true },
  { name: "maxXmlBytes", label: "Tamanho máximo do XML (bytes)", max: 10, numeric: true, limit: 20971520, required: true },
  { name: "maxExportRows", label: "Máximo de linhas por exportação", max: 10, numeric: true, limit: 100000, required: true },

  { name: "name", label: "Nome do contrato", max: 120, required: true },
  { name: "providerCode", label: "Código da clínica na operadora", max: 30 },
  { name: "cnes", label: "CNES", max: 7, numeric: true, hint: "Sete dígitos, se exigido pela operadora." },
  { name: "tissVersion", label: "Versão TISS informada pela operadora", max: 8, hint: "Padrão inicial: 04.03.00. Confirme a versão aceita antes da homologação." },
  { name: "manualReference", label: "Referência do manual ou canal de envio", max: 300, hint: "Título, data ou endereço do manual. Não informe senhas ou credenciais." },
];

export function ConfigForm({ kind, id, requestId, expectedVersion, operatorId, initial, cancelHref }: {
  kind: "operator" | "contract"; id: string; requestId: string; expectedVersion: number;
  operatorId?: string; initial: Record<string, string>; cancelHref: string;
}) {
  const [values, setValues] = useState(() => kind === "contract" ? { ...Object.fromEntries(Object.entries(CONTRACT_DEFAULTS).map(([key, value]) => [key, String(value)])), ...initial } : initial);
  const [state, action, pending] = useActionState(kind === "operator" ? saveOperator : saveContract, undefined);
  const fields = kind === "operator" ? operatorFields : contractFields;
  const errors = state?.fieldErrors;
  function error(name: string) {
    return errors?.[name]?.length ? <p id={`${name}-error`} className="text-sm text-destructive">{errors[name][0]}</p> : null;
  }
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      {operatorId && <input type="hidden" name="operatorId" value={operatorId} />}
      {state?.error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{state.error}</p>}
      {fields.map((field) => (
        <div key={field.name} className="flex flex-col gap-2">
          <Label htmlFor={field.name}>{field.label}{field.required ? " *" : ""}</Label>
          <Input id={field.name} name={field.name} value={values[field.name] ?? ""} required={field.required}
            type={field.limit ? "number" : "text"} min={field.limit ? 1 : undefined} max={field.limit} step={field.limit ? 1 : undefined}
            maxLength={field.max} inputMode={field.numeric ? "numeric" : undefined}
            aria-invalid={Boolean(errors?.[field.name])}
            aria-describedby={[field.hint && `${field.name}-hint`, errors?.[field.name] && `${field.name}-error`].filter(Boolean).join(" ") || undefined}
            onChange={(event) => setValues((old) => ({ ...old, [field.name]: event.target.value }))} />
          {field.hint && <p id={`${field.name}-hint`} className="text-xs text-muted-foreground">{field.hint}</p>}
          {error(field.name)}
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <Label htmlFor="active">Situação</Label>
        <NativeSelect id="active" name="active" value={values.active ?? "true"}
          onChange={(event) => setValues((old) => ({ ...old, active: event.target.value }))}>
          <option value="true">Ativo</option><option value="false">Inativo</option>
        </NativeSelect>
        {error("active")}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reason">Motivo do registro ou alteração *</Label>
        <Input id="reason" name="reason" required maxLength={300} value={values.reason ?? ""}
          aria-invalid={Boolean(errors?.reason)} aria-describedby={errors?.reason ? "reason-error" : undefined}
          onChange={(event) => setValues((old) => ({ ...old, reason: event.target.value }))} />
        {error("reason")}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>Voltar</Link>
      </div>
    </form>
  );
}
