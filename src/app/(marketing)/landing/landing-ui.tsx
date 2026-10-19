import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { CheckIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Primitivos visuais da landing. Só tokens do globals.css: a página precisa funcionar nos temas
// claro e escuro sem cor fixa. Cor é exceção; verde fica reservado aos checks.

export const CARD = "rounded-xl bg-card ring-1 ring-foreground/10";

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-4 md:px-8", className)} {...props} />;
}

export function Section({ className, ...props }: ComponentProps<"section">) {
  // scroll-mt compensa o cabeçalho fixo (h-18) ao navegar pelas âncoras.
  return <section className={cn("scroll-mt-18 py-16 md:py-24", className)} {...props} />;
}

// Rótulo em Geist Mono, caixa alta espaçada (regra de marca).
export function Eyebrow({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("font-mono text-[11px] font-medium tracking-[0.25em] text-muted-foreground uppercase", className)}
      {...props}
    />
  );
}

export function SectionTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2 className={cn("text-3xl leading-[1.15] font-bold tracking-tight text-foreground md:text-[38px]", className)} {...props} />
  );
}

export function SectionIntro({
  label,
  title,
  children,
  className,
}: {
  label: string;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex max-w-[720px] flex-col gap-3.5", className)}>
      <Eyebrow>{label}</Eyebrow>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}

export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn("text-[19px] font-bold tracking-tight text-foreground", className)}>
      TechLab+ <span className="text-brand-blue">Fisio</span>
    </span>
  );
}

export function IconBox({ Icon, className }: { Icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground", className)}>
      <Icon aria-hidden="true" className="size-5" />
    </span>
  );
}

export function CheckItem({ children, as: Tag = "div" }: { children: ReactNode; as?: "div" | "li" }) {
  return (
    <Tag className="flex items-start gap-2.5 text-[15px] leading-normal text-foreground">
      <CheckIcon aria-hidden="true" className="mt-0.75 size-4.5 shrink-0 text-brand-green" strokeWidth={2.5} />
      <span>{children}</span>
    </Tag>
  );
}

type ButtonVariant = "primary" | "outline" | "inverted" | "ghost";

const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-transparent px-5 text-[15px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline: "border-input bg-card text-primary hover:bg-muted",
  // Sobre fundo primário (CTA final): botão cheio claro e botão só com contorno.
  inverted: "bg-primary-foreground text-primary hover:bg-primary-foreground/90",
  ghost: "border-primary-foreground/35 text-primary-foreground hover:bg-primary-foreground/10",
};

export function LandingButton({
  href,
  variant = "primary",
  className,
  children,
  onClick,
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const classes = cn(BUTTON_BASE, BUTTON_VARIANTS[variant], className);
  // Rotas do app passam pelo Link; âncoras da própria página e mailto ficam em <a>.
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={classes} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={classes} onClick={onClick}>
      {children}
    </a>
  );
}
