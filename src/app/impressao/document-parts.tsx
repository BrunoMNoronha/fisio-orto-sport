import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

// Folha A4. Na tela aparece como papel sobre fundo cinza; na impressão ocupa a página
// (a margem é o padding, já que @page não tem margem).
export function Sheet({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <article
      className={cn(
        "documento mx-auto w-[210mm] min-h-[297mm] p-[14mm] text-[10.5pt] leading-snug shadow-lg print:shadow-none",
        className,
      )}
    >
      {children}
    </article>
  );
}

export function DocumentHeader({ title }: { title?: React.ReactNode }) {
  return (
    <header className="flex flex-col items-center gap-3 text-center">
      <BrandLogo />
      {title && <h1 className="text-[12.5pt] font-bold uppercase tracking-wide">{title}</h1>}
    </header>
  );
}

// "Rótulo: ____valor____": valor sobre a linha; vazio vira linha em branco para preencher à mão.
export function FillField({
  label,
  value,
  className,
}: {
  label: string;
  value?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-end gap-1.5", className)}>
      <span className="shrink-0 font-semibold">{label}:</span>
      <span className="min-h-[1.35em] min-w-0 flex-1 truncate border-b border-black/70 px-1">{value || " "}</span>
    </div>
  );
}

export function SignatureLine({ label, name }: { label: string; name?: string | null }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="min-h-[1.35em] text-[9.5pt]">{name ?? " "}</span>
      <span className="w-full border-t border-black/70" />
      <span>{label}</span>
    </div>
  );
}
