import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";
import { identityLines, type ClinicIdentity as Identity } from "@/modules/configuracoes/settings";

// Folha A4. Na tela aparece como papel sobre fundo cinza; na impressão ocupa a página
// (a margem é o padding, já que @page não tem margem).
export function Sheet({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <article
      className={cn(
        "documento mx-auto p-[14mm] text-[10.5pt] leading-snug shadow-lg print:shadow-none",
        className,
      )}
    >
      {children}
    </article>
  );
}

// Identificação da clínica configurada (issue #63). Só as linhas com algum dado aparecem; sem
// configuração, o cabeçalho fica como antes (só a marca). Reimpressões usam a identificação vigente.
export function ClinicIdentity({ clinic, className }: { clinic: Identity; className?: string }) {
  const { title, lines } = identityLines(clinic);
  return (
    <div className={cn("grid gap-0.5 text-[8.5pt] leading-tight", className)}>
      {title && <p className="text-[10pt] font-semibold">{title}</p>}
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

export function DocumentHeader({ title, clinic }: { title?: React.ReactNode; clinic?: Identity | null }) {
  return (
    <header className="flex flex-col items-center gap-3 text-center">
      {clinic ? (
        // Marca e identificação lado a lado: o cabeçalho quase não cresce, e documentos de uma
        // página (termo) continuam cabendo no A4.
        <div className="flex w-full items-center justify-between gap-6">
          <BrandLogo className="shrink-0" />
          <ClinicIdentity clinic={clinic} className="min-w-0 text-right" />
        </div>
      ) : (
        <BrandLogo />
      )}
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
