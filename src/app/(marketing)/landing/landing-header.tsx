"use client";

import { useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { NAV_LINKS } from "./landing-content";
import { BrandName, Container, LandingButton } from "./landing-ui";

const NAV_LINK = "text-[15px] font-medium text-muted-foreground transition-colors hover:text-foreground";

// Cabeçalho fixo. A partir de `md` mostra a navegação inteira; abaixo disso ela recolhe num botão
// (estado local, sem portal), e o painel fecha ao escolher um destino.
export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
      <Container className="flex h-18 items-center justify-between gap-6">
        <a href="#topo" className="flex items-center gap-2.5" onClick={close}>
          <span className="flex size-8.5 items-center justify-center rounded-[10px] bg-primary text-[15px] font-bold tracking-tighter text-primary-foreground">
            T+
          </span>
          <BrandName />
        </a>

        <nav aria-label="Principal" className="hidden gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={NAV_LINK}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden gap-2.5 md:flex">
          <LandingButton href="/login" variant="outline">
            Entrar
          </LandingButton>
          <LandingButton href="#contato">Agendar demonstração</LandingButton>
        </div>

        <button
          type="button"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          aria-controls="menu-celular"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex size-11 items-center justify-center rounded-xl border border-input bg-card text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
        >
          {open ? <XIcon aria-hidden="true" className="size-5" /> : <MenuIcon aria-hidden="true" className="size-5" />}
        </button>
      </Container>

      {open && (
        <div id="menu-celular" className="border-t bg-background md:hidden">
          <Container className="flex flex-col gap-4 py-4">
            <nav aria-label="Menu" className="flex flex-col">
              {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href} onClick={close} className={`${NAV_LINK} py-2.5`}>
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="flex flex-col gap-2.5">
              <LandingButton href="/login" variant="outline" onClick={close}>
                Entrar
              </LandingButton>
              <LandingButton href="#contato" onClick={close}>
                Agendar demonstração
              </LandingButton>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
