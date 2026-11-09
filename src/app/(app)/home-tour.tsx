"use client";

// Apresentação de primeiro acesso do financeiro na página inicial. Poucos passos, texto curto.
// Fechar por Esc, pelo fundo ou por "Pular" vale como visto, igual a "Concluir".
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { markFinanceTourSeenAction } from "@/modules/onboarding/actions";

export const TOUR_STEPS = [
  {
    title: "Novidade: finanças na página inicial",
    description: "Os indicadores financeiros do mês agora aparecem aqui, logo ao entrar.",
  },
  {
    title: "Cobrado e recebido no mês",
    description:
      "O vencimento define o cobrado; a data do recebimento define o recebido. Cada um traz a variação em relação ao mês anterior.",
  },
  {
    title: "A receber e vencido",
    description: "Saldo em aberto das cobranças ativas e a parte que já passou do vencimento.",
  },
  {
    title: "Relatórios completos",
    description: "Cada card leva ao relatório correspondente em Financeiro, com os filtros já preenchidos.",
  },
] as const;

export function HomeTour() {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [, startTransition] = useTransition();
  const primaryRef = useRef<HTMLButtonElement>(null);

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  function finish() {
    // Esconde já; a gravação segue em segundo plano. Se falhar, o tour volta na próxima visita.
    setOpen(false);
    startTransition(async () => {
      await markFinanceTourSeenAction();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) finish();
      }}
    >
      <DialogContent showCloseButton={false} initialFocus={() => primaryRef.current ?? true}>
        <DialogHeader>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription>{current.description}</DialogDescription>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Passo {step + 1} de {TOUR_STEPS.length}
          </p>
        </DialogHeader>
        <DialogFooter>
          {!isLast && (
            <Button type="button" variant="ghost" onClick={finish}>
              Pular
            </Button>
          )}
          {isLast ? (
            <Button ref={primaryRef} type="button" onClick={finish}>
              Concluir
            </Button>
          ) : (
            <Button ref={primaryRef} type="button" onClick={() => setStep((value) => value + 1)}>
              Próximo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
