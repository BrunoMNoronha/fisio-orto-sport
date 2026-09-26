"use client";

import Link from "next/link";
import { Fragment, useActionState, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentActionState } from "@/modules/clinico/assessment-actions";
import {
  ASSESSMENT_FIELD_LABELS,
  ASSESSMENT_LIMITS,
  type AssessmentField,
} from "@/modules/clinico/assessment-validation";

type Action = (prev: AssessmentActionState, formData: FormData) => Promise<AssessmentActionState>;

export type AssessmentFormValues = Record<AssessmentField, string>;
export type AnamnesisOption = { id: string; label: string };

type TextField = Exclude<AssessmentField, "assessmentDate">;

// Ordem de foco no primeiro erro: a mesma da tela.
const FOCUS_ORDER = [
  "assessmentDate",
  "anamnesisId",
  "inspection",
  "palpation",
  "functionalGait",
  "rangeOfMotion",
  "muscleStrength",
  "specialTests",
  "diagnosis",
  "therapeuticGoals",
  "clinicalNotes",
] as const;

const HINTS: Partial<Record<TextField, string>> = {
  rangeOfMotion: "Segmento, lado, movimento e medida (com a unidade, ex.: graus) quando houver.",
  muscleStrength: "Grupo muscular, lado e graduação (ex.: escala MRC 0–5) quando utilizada.",
  specialTests: "Nome do teste, lado e resultado.",
  therapeuticGoals: "Objetivos definidos pelo profissional (distintos dos objetivos relatados pelo paciente).",
};

const EXAM_FIELDS: TextField[] = [
  "inspection",
  "palpation",
  "functionalGait",
  "rangeOfMotion",
  "muscleStrength",
  "specialTests",
];

export const EMPTY_ASSESSMENT: AssessmentFormValues = {
  assessmentDate: "",
  inspection: "",
  palpation: "",
  functionalGait: "",
  rangeOfMotion: "",
  muscleStrength: "",
  specialTests: "",
  diagnosis: "",
  therapeuticGoals: "",
  clinicalNotes: "",
};

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}

function describedBy(...ids: (string | false | undefined)[]) {
  return ids.filter(Boolean).join(" ") || undefined;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-5 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 sm:p-6"
    >
      <h3 id={id} className="font-heading text-base font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

// Criação (com a anamnese de referência) ou edição (com a versão carregada, para a checagem
// otimista). Campos controlados: os valores sobrevivem a um erro de validação.
export function AssessmentForm({
  action,
  initial,
  anamnesisOptions,
  initialAnamnesisId = "",
  version,
  cancelHref,
  submitLabel,
}: {
  action: Action;
  initial: AssessmentFormValues;
  anamnesisOptions?: AnamnesisOption[];
  initialAnamnesisId?: string;
  version?: number;
  cancelHref: string;
  submitLabel: string;
}) {
  const [values, setValues] = useState(initial);
  const [anamnesisId, setAnamnesisId] = useState(initialAnamnesisId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const errors = state?.fieldErrors;
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  // Depois de cada resposta com erro, leva o foco ao primeiro campo inválido (ou ao alerta geral).
  useEffect(() => {
    if (!state) return;
    const field = FOCUS_ORDER.find((name) => state.fieldErrors?.[name]);
    const target = field
      ? formRef.current?.querySelector<HTMLElement>(`#avaliacao-${field}`)
      : state.error
        ? alertRef.current
        : null;
    target?.focus();
  }, [state]);

  function a11y(name: string, hint?: boolean) {
    const id = `avaliacao-${name}`;
    const error = errors?.[name];
    return {
      id,
      name,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy(hint && `${id}-dica`, error && `${id}-erro`),
    } as const;
  }

  function longText(name: TextField, options: { required?: boolean; rows?: number; className?: string } = {}) {
    const id = `avaliacao-${name}`;
    const hint = HINTS[name];
    return (
      <div className={cn("flex flex-col gap-2", options.className)}>
        <Label htmlFor={id}>
          {ASSESSMENT_FIELD_LABELS[name]}
          {options.required ? " *" : " (opcional)"}
        </Label>
        {hint && (
          <p id={`${id}-dica`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        <Textarea
          {...a11y(name, Boolean(hint))}
          value={values[name]}
          onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
          maxLength={ASSESSMENT_LIMITS[name]}
          required={options.required}
          rows={options.rows ?? 3}
        />
        <FieldError id={`${id}-erro`} messages={errors?.[name]} />
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5" noValidate>
      {version !== undefined && <input type="hidden" name="version" value={version} />}
      {state?.error && (
        <Alert ref={alertRef} tabIndex={-1} variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Section id="avaliacao-secao-identificacao" title="Identificação">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="avaliacao-assessmentDate">{ASSESSMENT_FIELD_LABELS.assessmentDate} *</Label>
            <Input
              {...a11y("assessmentDate")}
              type="date"
              required
              value={values.assessmentDate}
              onChange={(event) => setValues((current) => ({ ...current, assessmentDate: event.target.value }))}
            />
            <FieldError id="avaliacao-assessmentDate-erro" messages={errors?.assessmentDate} />
          </div>
          {anamnesisOptions && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="avaliacao-anamnesisId">Anamnese de referência *</Label>
              <NativeSelect
                {...a11y("anamnesisId")}
                value={anamnesisId}
                onChange={(event) => setAnamnesisId(event.target.value)}
                required
                className="w-full"
              >
                <NativeSelectOption value="" disabled>
                  Selecione
                </NativeSelectOption>
                {anamnesisOptions.map((option) => (
                  <NativeSelectOption key={option.id} value={option.id}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError id="avaliacao-anamnesisId-erro" messages={errors?.anamnesisId} />
            </div>
          )}
        </div>
      </Section>

      <Section id="avaliacao-secao-exame" title="Exame físico">
        <p className="-mt-2 text-sm text-muted-foreground">
          Campo em branco significa “não informado”, nunca resultado normal.
        </p>
        <div className="grid gap-4 md:grid-cols-2">{EXAM_FIELDS.map((name) => <Fragment key={name}>{longText(name)}</Fragment>)}</div>
      </Section>

      <Section id="avaliacao-secao-sintese" title="Síntese">
        <div className="grid gap-4 md:grid-cols-2">
          {longText("diagnosis", { required: true, rows: 4, className: "md:col-span-2" })}
          {longText("therapeuticGoals", { rows: 4 })}
          {longText("clinicalNotes", { rows: 4 })}
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <p className="text-xs text-muted-foreground">* Campos obrigatórios.</p>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={cancelHref} className={buttonVariants({ variant: "ghost", size: "lg" })}>
            Cancelar
          </Link>
          <Button type="submit" size="lg" disabled={pending} aria-disabled={pending}>
            {pending ? "Salvando…" : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
