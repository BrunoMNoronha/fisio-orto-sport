"use client";

import { AlertCircle, Check, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AnamnesisActionState } from "@/modules/clinico/actions";
import { LIMITS, PAIN_TYPES, PAIN_TYPE_LABELS, type PainTypeValue } from "@/modules/clinico/validation";
import {
  ANAMNESIS_STEPS,
  firstFieldWithError,
  stepHasError,
  type AnamnesisField,
  type AnamnesisStep,
} from "./anamnesis-steps";
import { ChoiceChip } from "./choice-chip";
import { PainScale } from "./pain-scale";

type Action = (prev: AnamnesisActionState, formData: FormData) => Promise<AnamnesisActionState>;

export type AnamnesisFormValues = {
  assessmentDate: string;
  chiefComplaint: string;
  currentIllnessHistory: string;
  personalPathologicalHistory: string;
  surgeries: string;
  currentMedications: string;
  habitsPhysicalActivity: string;
  painIntensity: string;
  painLocation: string;
  functionalLimitations: string;
  patientGoals: string;
  clinicalNotes: string;
};

type TextField = keyof AnamnesisFormValues;

const LAST_STEP = ANAMNESIS_STEPS.length - 1;

const DISCARD_MESSAGE = "Descartar as alterações não salvas desta anamnese?";

// Radios e checkboxes não têm id único: foca o marcado ou o primeiro do grupo.
function fieldElement(form: HTMLFormElement | null, field: AnamnesisField) {
  if (!form) return null;
  if (field === "painIntensity")
    return (
      form.querySelector<HTMLElement>("input[name=painIntensity]:checked") ??
      form.querySelector<HTMLElement>("input[name=painIntensity]")
    );
  if (field === "painTypes") return form.querySelector<HTMLElement>("input[name=painTypes]");
  return form.querySelector<HTMLElement>(`#anamnese-${field}`);
}

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}

function a11y(id: string, errors?: string[]) {
  return {
    id,
    "aria-invalid": errors ? true : undefined,
    "aria-describedby": errors ? `${id}-erro` : undefined,
  } as const;
}

function StepSection({
  step,
  index,
  active,
  headingRef,
  children,
}: {
  step: AnamnesisStep;
  index: number;
  active: boolean;
  headingRef: React.Ref<HTMLHeadingElement>;
  children: React.ReactNode;
}) {
  const headingId = `anamnese-etapa-${step.id}`;
  return (
    <section
      aria-labelledby={headingId}
      hidden={!active}
      className="flex flex-col gap-5 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 sm:p-6"
    >
      <h3
        id={headingId}
        ref={active ? headingRef : undefined}
        tabIndex={-1}
        className="font-heading text-base font-semibold outline-none"
      >
        <span className="sr-only">Etapa {index + 1}: </span>
        {step.title}
      </h3>
      {children}
    </section>
  );
}

// Formulário em etapas: todas as seções ficam montadas (as inativas com `hidden`), então um único
// submit envia todos os campos. Campos controlados: os valores sobrevivem a um erro de validação.
export function AnamnesisForm({
  action,
  initial,
  initialPainTypes,
  cancelHref,
}: {
  action: Action;
  initial: AnamnesisFormValues;
  initialPainTypes: PainTypeValue[];
  cancelHref: string;
}) {
  const [values, setValues] = useState(initial);
  const [painTypes, setPainTypes] = useState<PainTypeValue[]>(initialPainTypes);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [step, setStep] = useState(0);
  const [handledState, setHandledState] = useState(state);
  // Cada resposta da action remonta o alerta geral, para que um erro repetido seja anunciado de novo.
  const [responseSeq, setResponseSeq] = useState(0);
  // Pedido de foco (troca de etapa ou erro): `field` foca o campo; sem ele, o título da etapa.
  const [focusRequest, setFocusRequest] = useState<{ seq: number; field?: AnamnesisField }>({ seq: 0 });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state?.fieldErrors;

  // Nova resposta da action com erro de campo: abre a etapa e foca o primeiro campo inválido.
  if (state !== handledState) {
    setHandledState(state);
    setResponseSeq((n) => n + 1);
    const invalid = firstFieldWithError(state?.fieldErrors);
    if (invalid) {
      setStep(invalid.step);
      setFocusRequest((current) => ({ seq: current.seq + 1, field: invalid.field }));
    }
  }

  useEffect(() => {
    if (!focusRequest.seq) return;
    const target = focusRequest.field && fieldElement(formRef.current, focusRequest.field);
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.closest("form")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focusRequest]);

  const dirty =
    (Object.keys(initial) as TextField[]).some((name) => values[name] !== initial[name]) ||
    painTypes.join() !== initialPainTypes.join();

  // Alterações não salvas: avisa ao fechar/recarregar a aba e ao seguir qualquer link (navegação no
  // cliente não dispara beforeunload). Desligado durante o envio; o redirect após salvar desmonta o form.
  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const guardLinks = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.getAttribute("target") === "_blank") return;
      if (window.confirm(DISCARD_MESSAGE)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLinks, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLinks, true);
    };
  }, [dirty, pending]);

  function goTo(index: number) {
    if (index === step) return;
    setStep(index);
    setFocusRequest((current) => ({ seq: current.seq + 1 }));
  }

  // Enter em campo de linha única avança de etapa em vez de enviar; só na última etapa ele envia.
  function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || step === LAST_STEP) return;
    if (!(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    goTo(step + 1);
  }

  // Envio via onSubmit (e não `action` no form): o `<form action>` do React reseta o form após a
  // resposta, o que desmarca radios e checkboxes controlados e faria o próximo envio perder dados.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  function field(name: TextField) {
    return {
      name,
      value: values[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setValues((current) => ({ ...current, [name]: event.target.value })),
    };
  }

  function longText(
    name: Exclude<TextField, "assessmentDate" | "painIntensity">,
    label: string,
    options: { rows?: number; placeholder?: string; className?: string } = {},
  ) {
    const id = `anamnese-${name}`;
    return (
      <div className={cn("flex flex-col gap-2", options.className)}>
        <Label htmlFor={id}>{label}</Label>
        <Textarea
          {...a11y(id, errors?.[name])}
          {...field(name)}
          maxLength={LIMITS[name]}
          rows={options.rows ?? 3}
          placeholder={options.placeholder}
        />
        <FieldError id={`${id}-erro`} messages={errors?.[name]} />
      </div>
    );
  }

  function togglePainType(type: PainTypeValue, checked: boolean) {
    setPainTypes((current) =>
      checked ? PAIN_TYPES.filter((t) => t === type || current.includes(t)) : current.filter((t) => t !== type),
    );
  }

  function isFilled(target: AnamnesisStep) {
    return (target.filledBy ?? target.fields).some((name) =>
      name === "painTypes" ? painTypes.length > 0 : values[name].trim() !== "",
    );
  }

  const next = ANAMNESIS_STEPS[step + 1];

  return (
    <form ref={formRef} onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex flex-col gap-5" noValidate>
      {/* Região viva sempre montada: só o conteúdo muda, para o leitor de tela anunciar o erro. */}
      {/* Vazia, anula o gap do form sem sair da árvore de acessibilidade (display: none não serve). */}
      <div id="anamnese-erro-geral" role="alert" aria-atomic="true" className="empty:-mb-5">
        {state?.error && (
          <Alert key={responseSeq} variant="destructive" role="none">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Etapas da anamnese" className="lg:sticky lg:top-20 lg:self-start">
          <ol className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:rounded-xl lg:bg-card lg:p-3 lg:ring-1 lg:ring-foreground/10">
            {ANAMNESIS_STEPS.map((item, index) => {
              const active = index === step;
              const hasError = stepHasError(item, errors);
              const filled = !active && !hasError && isFilled(item);
              return (
                <li key={item.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => goTo(index)}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      active ? "bg-primary/10 font-semibold text-foreground" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-6.5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        hasError
                          ? "bg-destructive text-white"
                          : active
                            ? "bg-primary text-primary-foreground"
                            : filled
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground",
                      )}
                    >
                      {hasError ? (
                        <AlertCircle className="size-3.5" />
                      ) : filled ? (
                        <Check className="size-3.5" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    {item.title}
                    {hasError && <span className="sr-only"> (com erro)</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          <StepSection step={ANAMNESIS_STEPS[0]} index={0} active={step === 0} headingRef={headingRef}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="anamnese-assessmentDate">Data da avaliação *</Label>
                <Input
                  {...a11y("anamnese-assessmentDate", errors?.assessmentDate)}
                  {...field("assessmentDate")}
                  type="date"
                  required
                />
                <FieldError id="anamnese-assessmentDate-erro" messages={errors?.assessmentDate} />
              </div>
              {longText("chiefComplaint", "Queixa principal (nas palavras do paciente) *", {
                rows: 2,
                placeholder: "Ex.: dor no ombro direito ao elevar o braço há 3 meses",
                className: "md:col-span-3",
              })}
              {longText("currentIllnessHistory", "História da doença atual (HDA)", {
                rows: 5,
                placeholder: "Início, evolução, fatores de melhora e piora, tratamentos anteriores",
                className: "md:col-span-3",
              })}
            </div>
          </StepSection>

          <StepSection step={ANAMNESIS_STEPS[1]} index={1} active={step === 1} headingRef={headingRef}>
            <div className="flex flex-col gap-2">
              <PainScale
                id="anamnese-painIntensity"
                value={values.painIntensity}
                onChange={(painIntensity) => setValues((current) => ({ ...current, painIntensity }))}
                invalid={Boolean(errors?.painIntensity)}
                describedBy={errors?.painIntensity ? "anamnese-painIntensity-erro" : undefined}
              />
              <FieldError id="anamnese-painIntensity-erro" messages={errors?.painIntensity} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="anamnese-painLocation">Localização</Label>
                <Input
                  {...a11y("anamnese-painLocation", errors?.painLocation)}
                  {...field("painLocation")}
                  maxLength={LIMITS.painLocation}
                  autoComplete="off"
                  placeholder="Ex.: ombro direito, face anterior"
                />
                <FieldError id="anamnese-painLocation-erro" messages={errors?.painLocation} />
              </div>
            </div>
            <div
              role="group"
              aria-labelledby="anamnese-painTypes-rotulo"
              aria-describedby={errors?.painTypes ? "anamnese-painTypes-erro" : undefined}
              className="flex flex-col gap-2"
            >
              <span id="anamnese-painTypes-rotulo" className="text-sm font-medium">
                Característica (pode marcar mais de uma)
              </span>
              <div className="flex flex-wrap gap-2">
                {PAIN_TYPES.map((type) => (
                  <ChoiceChip
                    key={type}
                    label={PAIN_TYPE_LABELS[type]}
                    name="painTypes"
                    value={type}
                    checked={painTypes.includes(type)}
                    onChange={(event) => togglePainType(type, event.target.checked)}
                  />
                ))}
              </div>
              <FieldError id="anamnese-painTypes-erro" messages={errors?.painTypes} />
            </div>
          </StepSection>

          <StepSection step={ANAMNESIS_STEPS[2]} index={2} active={step === 2} headingRef={headingRef}>
            <div className="grid gap-4 md:grid-cols-2">
              {longText("personalPathologicalHistory", "Antecedentes pessoais e patológicos", {
                rows: 4,
                placeholder: "Doenças crônicas, fraturas, lesões prévias",
                className: "md:col-span-2",
              })}
              {longText("surgeries", "Cirurgias", { placeholder: "Procedimento, ano, lado" })}
              {longText("currentMedications", "Medicamentos em uso", { placeholder: "Nome, dose, frequência" })}
              {longText("habitsPhysicalActivity", "Hábitos e atividade física", {
                placeholder: "Atividade, frequência, ocupação, sono",
                className: "md:col-span-2",
              })}
            </div>
          </StepSection>

          <StepSection step={ANAMNESIS_STEPS[3]} index={3} active={step === 3} headingRef={headingRef}>
            <div className="grid gap-4 md:grid-cols-2">
              {longText("functionalLimitations", "Limitações funcionais relatadas", {
                rows: 4,
                placeholder: "Atividades que o paciente não consegue ou tem dificuldade de realizar",
              })}
              {longText("patientGoals", "Objetivos do paciente", {
                rows: 4,
                placeholder: "O que o paciente espera alcançar com o tratamento",
              })}
              {longText("clinicalNotes", "Observações clínicas", { rows: 4, className: "md:col-span-2" })}
            </div>
          </StepSection>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Etapa {step + 1} de {ANAMNESIS_STEPS.length}
          <span className="hidden sm:inline"> · Salvar cria uma nova versão; as anteriores ficam no histórico.</span>
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={cancelHref} className={buttonVariants({ variant: "ghost", size: "lg" })}>
            Cancelar
          </Link>
          {step > 0 && (
            <Button type="button" variant="outline" size="lg" onClick={() => goTo(step - 1)}>
              <ChevronLeft data-icon="inline-start" />
              Anterior
            </Button>
          )}
          <Button type="submit" variant={step === LAST_STEP ? "default" : "outline"} size="lg" disabled={pending}>
            {pending ? "Salvando…" : "Salvar anamnese"}
          </Button>
          {next && (
            <Button type="button" size="lg" onClick={() => goTo(step + 1)}>
              <span className="hidden sm:inline">Próxima etapa: </span>
              {next.title}
              <ChevronRight data-icon="inline-end" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
