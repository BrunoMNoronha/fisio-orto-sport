import { HelpLabel } from "@/components/informative-help";
// Checkbox em formato de pílula, para opções de múltipla escolha.
export function ChoiceChip({ label, ...input }: { label: string } & Omit<React.ComponentProps<"input">, "type">) {
  return (
    <HelpLabel help="Marca ou desmarca esta característica da dor relatada pelo paciente." className="flex h-9 cursor-pointer items-center gap-2 rounded-full border bg-background px-3 text-sm transition-colors hover:bg-muted has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
      <input type="checkbox" className="size-4 accent-primary" {...input} />
      {label}
    </HelpLabel>
  );
}
