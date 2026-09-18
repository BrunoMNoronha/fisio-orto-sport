"use client";

import { cn } from "cn";

const LEVELS = Array.from({ length: 11 }, (_, level) => String(level));

const option =
  "flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg border bg-background px-2 text-sm font-semibold transition-colors hover:bg-muted peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50";

// Escala visual analógica (EVA 0–10) com radios nativos: envia `painIntensity` como antes ("" = não informado).
export function PainScale({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={`${id}-rotulo`}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className="flex flex-col gap-2"
    >
      <span id={`${id}-rotulo`} className="text-sm font-medium">
        Intensidade da dor (EVA)
      </span>
      <div className="flex flex-wrap gap-1.5">
        {LEVELS.map((level) => (
          <label key={level} className="relative">
            <input
              type="radio"
              name="painIntensity"
              value={level}
              checked={value === level}
              onChange={() => onChange(level)}
              aria-label={`Dor ${level}`}
              className="peer sr-only"
            />
            <span className={option}>{level}</span>
          </label>
        ))}
        <label className="relative">
          <input
            type="radio"
            name="painIntensity"
            value=""
            checked={value === ""}
            onChange={() => onChange("")}
            className="peer sr-only"
          />
          <span className={cn(option, "px-3 font-medium")}>Não informado</span>
        </label>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground sm:max-w-[31rem]">
        <span>0 · Sem dor</span>
        <span>10 · Pior dor imaginável</span>
      </div>
    </div>
  );
}
