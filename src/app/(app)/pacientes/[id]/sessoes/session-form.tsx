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
import type { SessionActionState } from "@/modules/clinico/session-actions";
import { SESSION_FIELD_LABELS, SESSION_LIMITS, type SessionTextField } from "@/modules/clinico/session-validation";

type Action = (prev: SessionActionState, formData: FormData) => Promise<SessionActionState>;

export type SessionFormValues = {
  occurredDate: string;
  occurredTime: string;
  professionalId: string;
} & Record<SessionTextField, string>;

export type PlanRevisionOption = { id: string; label: string };
export type SessionPlanChoice = {
  id: string;
  label: string;
  currentRevisionId: string;
  revisions: PlanRevisionOption[];
  validSessions: number;
  plannedSessions: number | null;
};
export type ProfessionalChoice = { id: string; label: string };

type Mode =
  | { kind: "create"; requestId: string; plans: SessionPlanChoice[]; initialPlanId: string }
  | { kind: "edit"; version: number };

const FOCUS_ORDER = [
  "planId",
  "planRevisionId",
  "reason",
  "occurredDate",
  "occurredTime",
  "professionalId",
  "techniques",
  "exercises",
  "observations",
  "evolution",
  "nextSteps",
] as const;

const HINTS: Partial<Record<SessionTextField, string>> = {
  techniques: "O que foi efetivamente realizado nesta sessão (não copie a conduta prevista no plano).",
  evolution: "Resposta do paciente, comparação com sessões anteriores e achados relevantes.",
};

export const EMPTY_SESSION: SessionFormValues = {
  occurredDate: "",
  occurredTime: "",
  professionalId: "",
  techniques: "",
  exercises: "",
  observations: "",
  evolution: "",
  nextSteps: "",
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

// Registro (plano, revisão aplicada e chave de idempotência) ou correção (versão carregada e motivo).
// `fixedProfessional`: o fisioterapeuta logado registra como responsável por si (sem seletor).
export function SessionForm({
  action,
  initial,
  mode,
  professionals,
  fixedProfessional,
  cancelHref,
  submitLabel,
}: {
  action: Action;
  initial: SessionFormValues;
  mode: Mode;
  professionals: ProfessionalChoice[];
  fixedProfessional?: ProfessionalChoice;
  cancelHref: string;
  submitLabel: string;
}) {
  const [values, setValues] = useState(initial);
  const initialPlan = mode.kind === "create" ? mode.plans.find((plan) => plan.id === mode.initialPlanId) : undefined;
  const [planId, setPlanId] = useState(initialPlan?.id ?? "");
  const [revisionId, setRevisionId] = useState(initialPlan?.currentRevisionId ?? "");
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(action, undefined);
  const errors = state?.fieldErrors;
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const plan = mode.kind === "create" ? mode.plans.find((item) => item.id === planId) : undefined;

  useEffect(() => {
    if (!state) return;
    const field = FOCUS_ORDER.find((name) => state.fieldErrors?.[name]);
    const target = field
      ? formRef.current?.querySelector<HTMLElement>(`#sessao-${field}`)
      : state.error
        ? alertRef.current
        : null;
    target?.focus();
  }, [state]);

  function a11y(name: string, hint?: boolean) {
    const id = `sessao-${name}`;
    const error = errors?.[name];
    return {
      id,
      name,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": [hint && `${id}-dica`, error && `${id}-erro`].filter(Boolean).join(" ") || undefined,
    } as const;
  }

  function set(name: keyof SessionFormValues, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function choosePlan(id: string) {
    setPlanId(id);
    setRevisionId(mode.kind === "create" ? (mode.plans.find((item) => item.id === id)?.currentRevisionId ?? "") : "");
  }

  function longText(name: SessionTextField, options: { required?: boolean; rows?: number; className?: string } = {}) {
    const id = `sessao-${name}`;
    const hint = HINTS[name];
    return (
      <div className={cn("flex flex-col gap-2", options.className)}>
        <Label htmlFor={id}>
          {SESSION_FIELD_LABELS[name]}
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
          onChange={(event) => set(name, event.target.value)}
          maxLength={SESSION_LIMITS[name]}
          required={options.required}
          rows={options.rows ?? 3}
        />
        <FieldError id={`${id}-erro`} messages={errors?.[name]} />
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5" noValidate>
      {mode.kind === "create" && <input type="hidden" name="requestId" value={mode.requestId} />}
      {mode.kind === "edit" && <input type="hidden" name="version" value={mode.version} />}
      {state?.error && (
        <Alert ref={alertRef} tabIndex={-1} variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {mode.kind === "create" && (
        <Section id="sessao-secao-plano" title="Plano">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sessao-planId">Plano terapêutico *</Label>
              <NativeSelect {...a11y("planId")} value={planId} onChange={(event) => choosePlan(event.target.value)} className="w-full">
                <NativeSelectOption value="" disabled>
                  Selecione
                </NativeSelectOption>
                {mode.plans.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError id="sessao-planId-erro" messages={errors?.planId} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sessao-planRevisionId">Revisão do plano aplicada *</Label>
              <NativeSelect
                {...a11y("planRevisionId")}
                value={revisionId}
                onChange={(event) => setRevisionId(event.target.value)}
                className="w-full"
              >
                <NativeSelectOption value="" disabled>
                  Selecione
                </NativeSelectOption>
                {plan?.revisions.map((revision) => (
                  <NativeSelectOption key={revision.id} value={revision.id}>
                    {revision.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError id="sessao-planRevisionId-erro" messages={errors?.planRevisionId} />
            </div>
          </div>
          {plan && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Atendimentos válidos neste plano: {plan.validSessions}
              {plan.plannedSessions ? ` de ${plan.plannedSessions} previstos na revisão vigente` : ""}.
              {plan.plannedSessions && plan.validSessions >= plan.plannedSessions
                ? " A quantidade prevista já foi atingida; isso é só informativo e não impede o registro."
                : ""}
            </p>
          )}
        </Section>
      )}

      {mode.kind === "edit" && (
        <Section id="sessao-secao-correcao" title="Correção">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sessao-reason">Motivo da correção *</Label>
            <Textarea
              id="sessao-reason"
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={SESSION_LIMITS.reason}
              rows={2}
              required
              aria-invalid={errors?.reason ? true : undefined}
              aria-describedby={errors?.reason ? "sessao-reason-erro" : undefined}
            />
            <FieldError id="sessao-reason-erro" messages={errors?.reason} />
          </div>
        </Section>
      )}

      <Section id="sessao-secao-atendimento" title="Atendimento">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sessao-occurredDate">Data *</Label>
            <Input
              {...a11y("occurredDate")}
              type="date"
              required
              value={values.occurredDate}
              onChange={(event) => set("occurredDate", event.target.value)}
            />
            <FieldError id="sessao-occurredDate-erro" messages={errors?.occurredDate} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sessao-occurredTime">Hora *</Label>
            <Input
              {...a11y("occurredTime")}
              type="time"
              required
              value={values.occurredTime}
              onChange={(event) => set("occurredTime", event.target.value)}
            />
            <FieldError id="sessao-occurredTime-erro" messages={errors?.occurredTime} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sessao-professionalId">Profissional responsável *</Label>
            {fixedProfessional ? (
              <>
                <input type="hidden" name="professionalId" value={fixedProfessional.id} />
                <Input id="sessao-professionalId" value={fixedProfessional.label} readOnly aria-readonly />
              </>
            ) : (
              <NativeSelect
                {...a11y("professionalId")}
                value={values.professionalId}
                onChange={(event) => set("professionalId", event.target.value)}
                className="w-full"
              >
                <NativeSelectOption value="" disabled>
                  Selecione
                </NativeSelectOption>
                {professionals.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            <FieldError id="sessao-professionalId-erro" messages={errors?.professionalId} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {longText("techniques", { rows: 3 })}
          {longText("exercises", { rows: 3 })}
          {longText("evolution", { required: true, rows: 4, className: "md:col-span-2" })}
          {longText("observations", { rows: 3 })}
          {longText("nextSteps", { rows: 3 })}
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
