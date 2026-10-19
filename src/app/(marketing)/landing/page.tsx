import type { Metadata } from "next";
import { LandingHeader } from "./landing-header";
import {
  CtaSection,
  FaqSection,
  HeroSection,
  JourneySection,
  LandingFooter,
  ModulesSection,
  PlansSection,
  RecordSection,
  SecuritySection,
  StatsSection,
  TissSection,
} from "./sections";

export const metadata: Metadata = {
  title: "TechLab+ Fisio — Gestão para clínicas de fisioterapia",
  description:
    "Pacientes, agenda, prontuário clínico, financeiro e faturamento de convênios TISS em uma única plataforma, com LGPD por padrão e hospedagem em São Paulo.",
};

// Página pública do produto (liberada em src/proxy.ts). O layout raiz já fornece html, body, fontes e tema.
export default function LandingPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col overflow-x-clip bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1">
        <HeroSection />
        <StatsSection />
        <JourneySection />
        <ModulesSection />
        <RecordSection />
        <TissSection />
        <SecuritySection />
        <PlansSection />
        <FaqSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
