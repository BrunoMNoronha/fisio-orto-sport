"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AnamnesisActionState } from "@/modules/clinico/actions";
import { LIMITS, PAIN_TYPES, PAIN_TYPE_LABELS, type PainTypeValue } from "@/modules/clinico/validation";

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

// Campos controlados: os valores sobrevivem ao reset do formulário após uma validação com erro.
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
  const errors = state?.fieldErrors;

  function field(name: TextField) {
    return {
      name,
      value: values[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setValues((current) => ({ ...current, [name]: event.target.value })),
    };
  }

  function longText(name: Exclude<TextField, "assessmentDate" | "painIntensity">, label: string, rows = 3) {
    const id = `anamnese-${name}`;
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Textarea {...a11y(id, errors?.[name])} {...field(name)} maxLength={LIMITS[name]} rows={rows} />
        <FieldError id={`${id}-erro`} messages={errors?.[name]} />
      </div>
    );
  }

  function togglePainType(type: PainTypeValue, checked: boolean) {
    setPainTypes((current) =>
      checked ? PAIN_TYPES.filter((t) => t === type || current.includes(t)) : current.filter((t) => t !== type),
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {state?.error && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:max-w-xs">
        <Label htmlFor="anamnese-assessmentDate">Data da avaliação *</Label>
        <Input
          {...a11y("anamnese-assessmentDate", errors?.assessmentDate)}
          {...field("assessmentDate")}
          type="date"
          required
        />
        <FieldError id="anamnese-assessmentDate-erro" messages={errors?.assessmentDate} />
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-base font-medium">Queixa principal e história</legend>
        {longText("chiefComplaint", "Queixa principal *", 2)}
        {longText("currentIllnessHistory", "História da doença atual (HDA)", 5)}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-base font-medium">Histórico clínico e cirúrgico</legend>
        {longText("personalPathologicalHistory", "Antecedentes pessoais e patológicos")}
        {longText("surgeries", "Cirurgias", 2)}
        {longText("currentMedications", "Medicamentos em uso", 2)}
        {longText("habitsPhysicalActivity", "Hábitos e atividade física", 2)}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-base font-medium">Dor relatada</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="anamnese-painIntensity">Intensidade (EVA 0–10)</Label>
          <Input
            {...a11y("anamnese-painIntensity", errors?.painIntensity)}
            {...field("painIntensity")}
            type="number"
            inputMode="numeric"
            min={0}
            max={10}
            step={1}
          />
          <FieldError id="anamnese-painIntensity-erro" messages={errors?.painIntensity} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="anamnese-painLocation">Localização</Label>
          <Input
            {...a11y("anamnese-painLocation", errors?.painLocation)}
            {...field("painLocation")}
            maxLength={LIMITS.painLocation}
            autoComplete="off"
          />
          <FieldError id="anamnese-painLocation-erro" messages={errors?.painLocation} />
        </div>
        <div
          role="group"
          aria-labelledby="anamnese-painTypes-rotulo"
          aria-describedby={errors?.painTypes ? "anamnese-painTypes-erro" : undefined}
          className="flex flex-col gap-2 sm:col-span-2"
        >
          <span id="anamnese-painTypes-rotulo" className="text-sm font-medium">
            Tipo (pode marcar mais de um)
          </span>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {PAIN_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="painTypes"
                  value={type}
                  checked={painTypes.includes(type)}
                  onChange={(event) => togglePainType(type, event.target.checked)}
                  className="size-4 accent-primary"
                />
                {PAIN_TYPE_LABELS[type]}
              </label>
            ))}
          </div>
          <FieldError id="anamnese-painTypes-erro" messages={errors?.painTypes} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-base font-medium">Limitações e objetivos</legend>
        {longText("functionalLimitations", "Limitações funcionais relatadas")}
        {longText("patientGoals", "Objetivos do paciente")}
      </fieldset>

      {longText("clinicalNotes", "Observações clínicas")}

      <p className="text-xs text-muted-foreground">
        Salvar cria uma nova versão. As versões anteriores permanecem inalteradas no histórico.
      </p>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar anamnese"}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
