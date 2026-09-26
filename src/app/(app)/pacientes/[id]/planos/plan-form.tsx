"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { PlanActionState } from "@/modules/clinico/plan-actions";
import {
  PLANNED_SESSIONS_MAX,
  PLAN_FIELD_LABELS,
  PLAN_LIMITS,
  REVISION_KINDS,
  REVISION_KIND_LABELS,
  type PlanField,
} from "@/modules/clinico/plan-validation";

type Action = (prev: PlanActionState, formData: FormData) => Promise<PlanActionState>;

export type PlanFormValues = Record<PlanField, string>;

// Avaliação que pode originar o plano, com diagnóstico e objetivos de referência (só leitura aqui).
export type PlanOrigin = { id: string; label: string; diagnosis: string; therapeuticGoals: string | null };

// `reassessment`: revisão motivada por uma reavaliação com "Ajuste do plano" (tipo fixo: mudança clínica).
type Mode =
  | { kind: "create"; origins: PlanOrigin[]; initialAssessmentId: string }
  | { kind: "revise"; baseRevision: number; reassessment?: { id: string; label: string; reason: string } };

type TextField = Exclude<PlanField, "planDate" | "plannedSessions">;

const FOCUS_ORDER = [
  "assessmentId",
  "kind",
  "reason",
  "planDate",
  "goals",
  "conduct",
  "techniques",
  "exercises",
  "plannedSessions",
  "frequency",
  "reassessment",
  "notes",
] as const;

const HINTS: Partial<Record<PlanField, string>> = {
  goals: "Objetivos do profissional para este plano. Podem partir dos objetivos da avaliação, mas não os alteram.",
  plannedSessions: `Número inteiro de 1 a ${PLANNED_SESSIONS_MAX}. Só informativo: não bloqueia atendimentos nem encerra o plano.`,
  frequency: "Ex.: 2 vezes por semana.",
  reassessment: "Ex.: após 10 sessões ou em 30 dias.",
};

export const EMPTY_PLAN: PlanFormValues = {
  planDate: "",
  goals: "",
  conduct: "",
  techniques: "",
  exercises: "",
  plannedSessions: "",
  frequency: "",
  reassessment: "",
  notes: "",
};

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
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

// Criação (a partir de uma avaliação) ou nova revisão (tipo, motivo e revisão-base para a checagem
// otimista). Campos controlados: o preenchimento sobrevive a um erro de validação.
export function PlanForm({
  action,
  initial,
  mode,
  cancelHref,
  submitLabel,
}: {
  action: Action;
  initial: PlanFormValues;
  mode: Mode;
  cancelHref: string;
  submitLabel: string;
}) {
  const [values, setValues] = useState(initial);
  const [assessmentId, setAssessmentId] = useState(mode.kind === "create" ? mode.initialAssessmentId : "");
  const fromReassessment = mode.kind === "revise" ? mode.reassessment : undefined;
  const [kind, setKind] = useState(fromReassessment ? "MUDANCA_CLINICA" : "");
  const [reason, setReason] = useState(fromReassessment?.reason ?? "");
  const [state, formAction, pending] = useActionState(action, undefined);
  const errors = state?.fieldErrors;
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const origin = mode.kind === "create" ? mode.origins.find((item) => item.id === assessmentId) : undefined;

  // Depois de cada resposta com erro, leva o foco ao primeiro campo inválido (ou ao alerta geral).
  useEffect(() => {
    if (!state) return;
    const field = FOCUS_ORDER.find((name) => state.fieldErrors?.[name]);
    const target = field
      ? formRef.current?.querySelector<HTMLElement>(field === "kind" ? "input[name=kind]" : `#plano-${field}`)
      : state.error
        ? alertRef.current
        : null;
    target?.focus();
  }, [state]);

  function a11y(name: string) {
    const id = `plano-${name}`;
    const error = errors?.[name];
    const hint = HINTS[name as PlanField];
    return {
      id,
      name,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": [hint && `${id}-dica`, error && `${id}-erro`].filter(Boolean).join(" ") || undefined,
    } as const;
  }

  function set(name: PlanField, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function field(name: PlanField, label: string, control: React.ReactNode, className?: string) {
    const id = `plano-${name}`;
    const hint = HINTS[name];
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <Label htmlFor={id}>{label}</Label>
        {hint && (
          <p id={`${id}-dica`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        {control}
        <FieldError id={`${id}-erro`} messages={errors?.[name]} />
      </div>
    );
  }

  function longText(name: TextField, options: { required?: boolean; rows?: number; className?: string } = {}) {
    const label = `${PLAN_FIELD_LABELS[name]}${options.required ? " *" : " (opcional)"}`;
    return field(
      name,
      label,
      <Textarea
        {...a11y(name)}
        value={values[name]}
        onChange={(event) => set(name, event.target.value)}
        maxLength={PLAN_LIMITS[name]}
        required={options.required}
        rows={options.rows ?? 3}
      />,
      options.className,
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5" noValidate>
      {mode.kind === "revise" && <input type="hidden" name="baseRevision" value={mode.baseRevision} />}
      {fromReassessment && <input type="hidden" name="reassessmentId" value={fromReassessment.id} />}
      {state?.error && (
        <Alert ref={alertRef} tabIndex={-1} variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {mode.kind === "create" ? (
        <Section id="plano-secao-origem" title="Origem">
          <div className="flex flex-col gap-2">
            <Label htmlFor="plano-assessmentId">Avaliação de origem *</Label>
            <NativeSelect
              {...a11y("assessmentId")}
              value={assessmentId}
              onChange={(event) => setAssessmentId(event.target.value)}
              required
              className="w-full"
            >
              <NativeSelectOption value="" disabled>
                Selecione
              </NativeSelectOption>
              {mode.origins.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError id="plano-assessmentId-erro" messages={errors?.assessmentId} />
          </div>
          {origin && (
            <dl className="grid gap-4 rounded-lg bg-muted/50 p-4 text-sm md:grid-cols-2" aria-label="Referência da avaliação">
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">Diagnóstico fisioterapêutico</dt>
                <dd className="whitespace-pre-line">{origin.diagnosis}</dd>
              </div>
              <div className="flex flex-col items-start gap-2">
                <dt className="text-muted-foreground">Objetivos terapêuticos da avaliação</dt>
                <dd className="whitespace-pre-line">{origin.therapeuticGoals ?? "Não informado"}</dd>
                {origin.therapeuticGoals && (
                  <Button type="button" variant="outline" size="sm" onClick={() => set("goals", origin.therapeuticGoals ?? "")}>
                    Usar estes objetivos no plano
                  </Button>
                )}
              </div>
            </dl>
          )}
        </Section>
      ) : (
        <Section id="plano-secao-revisao" title="Revisão">
          {fromReassessment ? (
            <p className="text-sm">
              <input type="hidden" name="kind" value="MUDANCA_CLINICA" />
              Mudança clínica do planejamento, a partir da {fromReassessment.label}.
            </p>
          ) : (
            <fieldset
              className="flex flex-col gap-2"
              aria-invalid={errors?.kind ? true : undefined}
              aria-describedby={errors?.kind ? "plano-kind-erro" : undefined}
            >
              <legend className="mb-1 text-sm font-medium">Tipo de revisão *</legend>
              {REVISION_KINDS.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="kind"
                    value={option}
                    checked={kind === option}
                    onChange={() => setKind(option)}
                    className="size-4 accent-primary"
                  />
                  {REVISION_KIND_LABELS[option]}
                </label>
              ))}
              <FieldError id="plano-kind-erro" messages={errors?.kind} />
            </fieldset>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="plano-reason">Motivo da revisão *</Label>
            <Textarea
              id="plano-reason"
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={PLAN_LIMITS.reason}
              rows={2}
              required
              aria-invalid={errors?.reason ? true : undefined}
              aria-describedby={errors?.reason ? "plano-reason-erro" : undefined}
            />
            <FieldError id="plano-reason-erro" messages={errors?.reason} />
          </div>
        </Section>
      )}

      <Section id="plano-secao-planejamento" title="Planejamento">
        <div className="grid gap-4 md:grid-cols-2">
          {field(
            "planDate",
            `${PLAN_FIELD_LABELS.planDate} *`,
            <Input
              {...a11y("planDate")}
              type="date"
              required
              value={values.planDate}
              onChange={(event) => set("planDate", event.target.value)}
            />,
          )}
          {field(
            "plannedSessions",
            `${PLAN_FIELD_LABELS.plannedSessions} (opcional)`,
            <Input
              {...a11y("plannedSessions")}
              type="number"
              inputMode="numeric"
              min={1}
              max={PLANNED_SESSIONS_MAX}
              step={1}
              value={values.plannedSessions}
              onChange={(event) => set("plannedSessions", event.target.value)}
            />,
          )}
          {longText("goals", { required: true, rows: 4, className: "md:col-span-2" })}
          {longText("conduct", { required: true, rows: 4, className: "md:col-span-2" })}
          {longText("techniques", { rows: 4 })}
          {longText("exercises", { rows: 4 })}
          {field(
            "frequency",
            `${PLAN_FIELD_LABELS.frequency} (opcional)`,
            <Input
              {...a11y("frequency")}
              value={values.frequency}
              onChange={(event) => set("frequency", event.target.value)}
              maxLength={PLAN_LIMITS.frequency}
            />,
          )}
          {longText("reassessment", { rows: 2 })}
          {longText("notes", { rows: 3, className: "md:col-span-2" })}
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <p className="text-xs text-muted-foreground">
          * Campos obrigatórios.
          {mode.kind === "revise" && <span className="hidden sm:inline"> Salvar cria uma nova revisão; as anteriores são preservadas.</span>}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={cancelHref} className={buttonVariants({ variant: "ghost", size: "lg" })}>
            Cancelar
          </Link>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Salvando…" : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
