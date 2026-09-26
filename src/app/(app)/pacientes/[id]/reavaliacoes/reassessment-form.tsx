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
import type { ReassessmentActionState } from "@/modules/clinico/reassessment-actions";
import {
  CONCLUSIONS,
  CONCLUSION_LABELS,
  EXAM_FIELDS,
  GOALS_STATUSES,
  GOALS_STATUS_LABELS,
  REASSESSMENT_FIELD_LABELS,
  REASSESSMENT_LIMITS,
  type ReassessmentField,
  type ReassessmentTextField,
} from "@/modules/clinico/reassessment-validation";

type Action = (prev: ReassessmentActionState, formData: FormData) => Promise<ReassessmentActionState>;

export type ReassessmentFormValues = Record<ReassessmentField, string>;

// Plano que pode ser reavaliado, com o contexto de referência (só leitura aqui).
export type ReassessmentPlanChoice = {
  id: string;
  label: string;
  goalsLabel: string;
  goals: string;
  sessionsLabel: string;
  recentSessions: { id: string; label: string; evolution: string }[];
};

type Mode = { kind: "create"; plans: ReassessmentPlanChoice[]; initialPlanId: string } | { kind: "edit"; version: number };

const FOCUS_ORDER = [
  "planId",
  "reason",
  "reassessmentDate",
  ...EXAM_FIELDS,
  "painLimitations",
  "progressSummary",
  "goalsStatus",
  "goalsJustification",
  "conclusion",
  "conclusionSummary",
] as const;

export const EMPTY_REASSESSMENT: ReassessmentFormValues = {
  reassessmentDate: "",
  inspection: "",
  palpation: "",
  functionalGait: "",
  rangeOfMotion: "",
  muscleStrength: "",
  specialTests: "",
  painLimitations: "",
  progressSummary: "",
  goalsStatus: "",
  goalsJustification: "",
  conclusion: "",
  conclusionSummary: "",
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

// Registro (com o plano e seu contexto de referência) ou correção (versão carregada e motivo).
// Campos controlados: o preenchimento sobrevive a um erro de validação.
export function ReassessmentForm({
  action,
  initial,
  mode,
  cancelHref,
  submitLabel,
}: {
  action: Action;
  initial: ReassessmentFormValues;
  mode: Mode;
  cancelHref: string;
  submitLabel: string;
}) {
  const [values, setValues] = useState(initial);
  const [planId, setPlanId] = useState(mode.kind === "create" ? mode.initialPlanId : "");
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(action, undefined);
  const errors = state?.fieldErrors;
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const plan = mode.kind === "create" ? mode.plans.find((item) => item.id === planId) : undefined;

  useEffect(() => {
    if (!state) return;
    const field = FOCUS_ORDER.find((name) => state.fieldErrors?.[name]);
    const selector =
      field === "goalsStatus" || field === "conclusion" ? `input[name=${field}]` : field ? `#reavaliacao-${field}` : null;
    const target = selector ? formRef.current?.querySelector<HTMLElement>(selector) : state.error ? alertRef.current : null;
    target?.focus();
  }, [state]);

  function set(name: ReassessmentField, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function describedBy(name: string, hint?: boolean) {
    const id = `reavaliacao-${name}`;
    return [hint && `${id}-dica`, errors?.[name] && `${id}-erro`].filter(Boolean).join(" ") || undefined;
  }

  function longText(name: ReassessmentTextField, options: { required?: boolean; rows?: number; className?: string; hint?: string } = {}) {
    const id = `reavaliacao-${name}`;
    return (
      <div className={cn("flex flex-col gap-2", options.className)}>
        <Label htmlFor={id}>
          {REASSESSMENT_FIELD_LABELS[name]}
          {options.required ? " *" : " (opcional)"}
        </Label>
        {options.hint && (
          <p id={`${id}-dica`} className="text-xs text-muted-foreground">
            {options.hint}
          </p>
        )}
        <Textarea
          id={id}
          name={name}
          value={values[name]}
          onChange={(event) => set(name, event.target.value)}
          maxLength={REASSESSMENT_LIMITS[name]}
          required={options.required}
          rows={options.rows ?? 3}
          aria-invalid={errors?.[name] ? true : undefined}
          aria-describedby={describedBy(name, Boolean(options.hint))}
        />
        <FieldError id={`${id}-erro`} messages={errors?.[name]} />
      </div>
    );
  }

  function choice<T extends string>(name: "goalsStatus" | "conclusion", options: readonly T[], labels: Record<T, string>, hint?: string) {
    const id = `reavaliacao-${name}`;
    return (
      <fieldset className="flex flex-col gap-2" aria-describedby={describedBy(name, Boolean(hint))}>
        <legend className="mb-1 text-sm font-medium">{REASSESSMENT_FIELD_LABELS[name]} *</legend>
        {hint && (
          <p id={`${id}-dica`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={name}
              value={option}
              checked={values[name] === option}
              onChange={() => set(name, option)}
              className="size-4 accent-primary"
            />
            {labels[option]}
          </label>
        ))}
        <FieldError id={`${id}-erro`} messages={errors?.[name]} />
      </fieldset>
    );
  }

  function dateField() {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor="reavaliacao-reassessmentDate">{REASSESSMENT_FIELD_LABELS.reassessmentDate} *</Label>
        <Input
          id="reavaliacao-reassessmentDate"
          name="reassessmentDate"
          type="date"
          required
          value={values.reassessmentDate}
          onChange={(event) => set("reassessmentDate", event.target.value)}
          aria-invalid={errors?.reassessmentDate ? true : undefined}
          aria-describedby={describedBy("reassessmentDate")}
        />
        <FieldError id="reavaliacao-reassessmentDate-erro" messages={errors?.reassessmentDate} />
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5" noValidate>
      {mode.kind === "edit" && <input type="hidden" name="version" value={mode.version} />}
      {state?.error && (
        <Alert ref={alertRef} tabIndex={-1} variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {mode.kind === "create" ? (
        <Section id="reavaliacao-secao-referencia" title="Plano e referência">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="reavaliacao-planId">Plano terapêutico *</Label>
              <NativeSelect
                id="reavaliacao-planId"
                name="planId"
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
                className="w-full"
                aria-invalid={errors?.planId ? true : undefined}
                aria-describedby={describedBy("planId")}
              >
                <NativeSelectOption value="" disabled>
                  Selecione
                </NativeSelectOption>
                {mode.plans.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError id="reavaliacao-planId-erro" messages={errors?.planId} />
            </div>
            {dateField()}
          </div>
          {plan && (
            <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4 text-sm" aria-label="Contexto do plano">
              <p>
                <span className="text-muted-foreground">{plan.goalsLabel}: </span>
                <span className="whitespace-pre-line">{plan.goals}</span>
              </p>
              <p className="text-muted-foreground">{plan.sessionsLabel}</p>
              {plan.recentSessions.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {plan.recentSessions.map((session) => (
                    <li key={session.id}>
                      <span className="text-muted-foreground">{session.label}: </span>
                      <span className="line-clamp-2 whitespace-pre-line">{session.evolution}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                A comparação usará a avaliação de origem do plano e a última reavaliação dele, congeladas ao salvar.
              </p>
            </div>
          )}
        </Section>
      ) : (
        <Section id="reavaliacao-secao-correcao" title="Correção">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="reavaliacao-reason">Motivo da correção *</Label>
              <Textarea
                id="reavaliacao-reason"
                name="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={REASSESSMENT_LIMITS.reason}
                rows={2}
                required
                aria-invalid={errors?.reason ? true : undefined}
                aria-describedby={describedBy("reason")}
              />
              <FieldError id="reavaliacao-reason-erro" messages={errors?.reason} />
            </div>
            {dateField()}
          </div>
        </Section>
      )}

      <Section id="reavaliacao-secao-achados" title="Achados atuais">
        <p className="-mt-2 text-sm text-muted-foreground">Campo em branco significa “não informado”, nunca resultado normal.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {EXAM_FIELDS.map((name) => (
            <Fragment key={name}>{longText(name)}</Fragment>
          ))}
          {longText("painLimitations", { className: "md:col-span-2" })}
        </div>
      </Section>

      <Section id="reavaliacao-secao-conclusao" title="Evolução, objetivos e conclusão">
        <div className="grid gap-4 md:grid-cols-2">
          {longText("progressSummary", {
            required: true,
            rows: 4,
            className: "md:col-span-2",
            hint: "Compare com a referência com suas palavras; o sistema não calcula melhora.",
          })}
          {choice("goalsStatus", GOALS_STATUSES, GOALS_STATUS_LABELS)}
          {longText("goalsJustification", { required: true, rows: 4 })}
          {choice(
            "conclusion",
            CONCLUSIONS,
            CONCLUSION_LABELS,
            "Indicar alta só documenta: não encerra o plano, não inativa o paciente nem altera a agenda.",
          )}
          {longText("conclusionSummary", { required: true, rows: 4 })}
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <p className="text-xs text-muted-foreground">* Campos obrigatórios.</p>
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
