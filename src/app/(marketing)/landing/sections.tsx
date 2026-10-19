import { ArrowRightIcon, CheckIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgendaMock } from "./agenda-mock";
import {
  CONTACT_EMAIL,
  DEMO_MAILTO,
  FAQ,
  FOOTER_COLUMNS,
  HERO_PROOF,
  JOURNEY,
  MODULES,
  PLANS,
  RECORD_CHECKS,
  SECURITY,
  STATS,
  TISS_STEPS,
} from "./landing-content";
import { BrandName, CARD, CheckItem, Container, Eyebrow, IconBox, LandingButton, Section, SectionIntro, SectionTitle } from "./landing-ui";
import { RecordMock } from "./record-mock";

const LEAD = "text-[17px] leading-relaxed text-muted-foreground";

export function HeroSection() {
  return (
    <Section id="topo" className="md:py-22">
      <Container className="grid items-center gap-10 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-14">
        <div className="flex min-w-0 flex-col gap-7">
          <Eyebrow>Gestão para clínicas de fisioterapia</Eyebrow>
          <h1 className="text-4xl leading-[1.08] font-bold tracking-tight text-foreground md:text-[54px]">
            Gestão clínica organizada. Atendimento com continuidade. Evolução acompanhada.
          </h1>
          <p className="max-w-[560px] text-[19px] leading-snug text-muted-foreground">
            Pacientes, agenda, prontuário, financeiro e faturamento de convênios em uma única plataforma, feita para a
            rotina de recepção e fisioterapeutas.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <LandingButton href={DEMO_MAILTO}>
              Agendar demonstração
              <ArrowRightIcon aria-hidden="true" className="size-5" />
            </LandingButton>
            <LandingButton href="#modulos" variant="outline">
              Ver os módulos
            </LandingButton>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-2">
            {HERO_PROOF.map((item) => (
              <li key={item}>
                <Eyebrow className="flex items-center gap-2">
                  <CheckIcon aria-hidden="true" className="size-4 text-brand-green" strokeWidth={2.5} />
                  {item}
                </Eyebrow>
              </li>
            ))}
          </ul>
        </div>
        <AgendaMock />
      </Container>
    </Section>
  );
}

export function StatsSection() {
  return (
    <section aria-label="Números do produto" className="border-y bg-card">
      <Container className="grid grid-cols-2 gap-6 py-10 md:grid-cols-4">
        {STATS.map(({ value, label }) => (
          <div key={label} className="flex flex-col gap-1.5">
            <b className="font-mono text-[28px] font-medium text-primary tabular-nums">{value}</b>
            <Eyebrow>{label}</Eyebrow>
          </div>
        ))}
      </Container>
    </section>
  );
}

export function JourneySection() {
  return (
    <Section id="produto">
      <Container className="flex flex-col gap-12">
        <SectionIntro label="Jornada do paciente" title="Um fluxo só, do primeiro contato à alta">
          <p className={LEAD}>
            Cada etapa alimenta a seguinte. O agendamento vira sessão, a sessão vira evolução, e a reavaliação compara
            com a avaliação de origem sem retrabalho.
          </p>
        </SectionIntro>
        <ol className="flex flex-col items-center gap-2 md:flex-row md:flex-wrap md:items-stretch md:justify-center">
          {JOURNEY.map(({ label, Icon }, index) => (
            <li key={label} className="contents">
              {index > 0 && (
                <span aria-hidden="true" className="flex items-center text-muted-foreground/70">
                  <ArrowRightIcon className="size-5 rotate-90 md:rotate-0" />
                </span>
              )}
              <div
                className={cn(
                  CARD,
                  "flex w-full items-center gap-2.5 px-4 py-3.5 text-left md:w-auto md:min-w-[104px] md:flex-1 md:flex-col md:px-2 md:py-4 md:text-center lg:max-w-[132px]",
                )}
              >
                <IconBox Icon={Icon} />
                <span className="text-[13px] leading-tight font-semibold">{label}</span>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}

export function ModulesSection() {
  return (
    <Section id="modulos" className="border-y bg-card">
      <Container className="flex flex-col gap-12">
        <SectionIntro label="Módulos" title="Tudo o que a clínica usa no dia a dia, em um lugar só" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {MODULES.map(({ title, description, Icon }) => (
            <article key={title} className={cn(CARD, "flex flex-col gap-4 bg-background p-7")}>
              <IconBox Icon={Icon} />
              <h3 className="text-lg leading-snug font-semibold tracking-tight">{title}</h3>
              <p className="text-[15px] leading-relaxed text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  );
}

export function RecordSection() {
  return (
    <Section aria-labelledby="prontuario-titulo" className="bg-accent">
      <Container className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
        <div className="flex flex-col gap-6">
          <Eyebrow>Prontuário clínico</Eyebrow>
          <SectionTitle id="prontuario-titulo">Continuidade de verdade entre uma sessão e a próxima</SectionTitle>
          <p className={LEAD}>
            Quem atende abre a ficha e encontra a avaliação de origem, o plano vigente e a última evolução. Nada se
            perde quando o profissional muda.
          </p>
          <div className="flex flex-col gap-3">
            {RECORD_CHECKS.map((item) => (
              <CheckItem key={item}>{item}</CheckItem>
            ))}
          </div>
        </div>
        <RecordMock />
      </Container>
    </Section>
  );
}

// Seção escura: no tema claro inverte foreground/background; no escuro vira uma superfície de card.
export function TissSection() {
  return (
    <Section
      aria-labelledby="tiss-titulo"
      className="bg-foreground text-background dark:border-y dark:bg-card dark:text-foreground"
    >
      <Container className="flex flex-col gap-12">
        <div className="grid gap-6 md:grid-cols-2 md:items-end md:gap-8">
          <div className="flex flex-col gap-3.5">
            <Eyebrow className="text-background/70 dark:text-muted-foreground">Faturamento de convênios</Eyebrow>
            <SectionTitle id="tiss-titulo" className="text-background dark:text-foreground">
              Da sessão atendida ao XML TISS aceito pela operadora
            </SectionTitle>
          </div>
          <p className="text-[17px] leading-relaxed text-background/75 dark:text-muted-foreground">
            A produção é conferida a partir das sessões. Cada lote gera um XML TISS 4.03.00 validado contra o XSD, com
            hash guardado, e a conciliação registra pagamento ou glosa item por item.
          </p>
        </div>
        <ol className="grid gap-6 md:grid-cols-3">
          {TISS_STEPS.map(({ step, title, code, description }) => (
            <li
              key={step}
              className="flex flex-col gap-3.5 rounded-xl bg-background/8 p-7 ring-1 ring-background/10 dark:bg-muted dark:ring-border"
            >
              <Eyebrow className="text-background/70 dark:text-muted-foreground">{step}</Eyebrow>
              <h3 className="text-lg leading-snug font-semibold tracking-tight">{title}</h3>
              <pre className="rounded-[10px] bg-background/10 px-3.5 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-background/75 dark:bg-background dark:text-muted-foreground">
                {code.join("\n")}
              </pre>
              <p className="text-sm leading-relaxed text-background/75 dark:text-muted-foreground">{description}</p>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}

export function SecuritySection() {
  return (
    <Section id="seguranca">
      <Container className="flex flex-col gap-12">
        <SectionIntro label="Segurança e LGPD" title="Dado clínico é dado sensível. O sistema trata assim." />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {SECURITY.map(({ title, description, Icon }) => (
            <article key={title} className={cn(CARD, "flex flex-col gap-3.5 p-6")}>
              <IconBox Icon={Icon} />
              <h3 className="text-lg leading-snug font-semibold tracking-tight">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  );
}

export function PlansSection() {
  return (
    <Section id="planos" className="border-y bg-card">
      <Container className="flex flex-col gap-12">
        <SectionIntro label="Planos" title="Comece pela agenda. Cresça para convênios.">
          <p className="leading-relaxed text-muted-foreground">
            Valores mensais por clínica, com até 3 fisioterapeutas. Para equipes maiores, proposta sob medida.
          </p>
        </SectionIntro>
        <div className="grid items-stretch gap-6 md:grid-cols-3">
          {PLANS.map(({ name, price, description, features, cta, href, recommended }) => (
            <article
              key={name}
              className={cn(
                CARD,
                "relative flex flex-col gap-5 p-8",
                recommended ? "ring-2 ring-primary" : "bg-background",
              )}
            >
              {recommended && (
                <span className="absolute -top-3.5 left-8 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-primary-foreground uppercase">
                  Recomendado
                </span>
              )}
              <h3>
                <Eyebrow>{name}</Eyebrow>
              </h3>
              <p className="font-mono text-[30px] font-medium text-primary">
                {price}
                <span className="text-sm text-muted-foreground">/mês</span>
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
              <ul className="flex flex-col gap-2.5">
                {features.map((feature) => (
                  <CheckItem key={feature} as="li">
                    {feature}
                  </CheckItem>
                ))}
              </ul>
              <LandingButton href={href} variant={recommended ? "primary" : "outline"} className="mt-auto">
                {cta}
              </LandingButton>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  );
}

export function FaqSection() {
  return (
    <Section id="faq">
      <Container className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-12">
        <SectionIntro label="Perguntas frequentes" title="O que as clínicas perguntam antes de migrar" />
        <div className="flex min-w-0 flex-col gap-3">
          {FAQ.map(({ question, answer }, index) => (
            <details key={question} open={index === 0} className={cn(CARD, "group px-6")}>
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-3 text-base font-semibold [&::-webkit-details-marker]:hidden">
                {question}
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-4.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="pb-5 text-[15px] leading-relaxed text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
      </Container>
    </Section>
  );
}

export function CtaSection() {
  return (
    <Section id="contato" className="py-16 md:py-18">
      <Container>
        <div className="flex flex-col items-start gap-6 rounded-3xl bg-primary p-8 text-primary-foreground md:p-14">
          <Eyebrow className="text-primary-foreground/70">Demonstração</Eyebrow>
          <SectionTitle className="max-w-[720px] text-primary-foreground">
            Veja a agenda, o prontuário e o faturamento com os dados da sua clínica
          </SectionTitle>
          <p className="max-w-[640px] text-[17px] leading-relaxed text-primary-foreground/80">
            Uma conversa de 30 minutos com a equipe, sem compromisso. Mostramos o fluxo completo e respondemos sobre
            migração e convênios.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <LandingButton href={DEMO_MAILTO} variant="inverted">
              Agendar demonstração
            </LandingButton>
            <LandingButton href={`mailto:${CONTACT_EMAIL}`} variant="ghost">
              {CONTACT_EMAIL}
            </LandingButton>
          </div>
        </div>
      </Container>
    </Section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t bg-card">
      <Container className="grid gap-8 py-12 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div className="flex flex-col gap-3">
          <BrandName />
          <p className="max-w-[360px] text-sm leading-relaxed text-muted-foreground">
            Gestão para clínicas de fisioterapia. As telas desta página usam a clínica OrtoSport como exemplo, com dados
            fictícios.
          </p>
        </div>
        {FOOTER_COLUMNS.map(({ title, links }) => (
          <nav key={title} aria-label={title} className="flex flex-col gap-2.5">
            <Eyebrow>{title}</Eyebrow>
            {links.map(({ href, label }) => (
              <a key={label} href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
        ))}
      </Container>
      <div className="border-t">
        <Container className="flex flex-wrap justify-between gap-4 py-5">
          <Eyebrow>© 2026 TechLab+ · Fisio</Eyebrow>
          <Eyebrow>Feito em São Paulo</Eyebrow>
        </Container>
      </div>
    </footer>
  );
}
