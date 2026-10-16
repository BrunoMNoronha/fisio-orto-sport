"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ActionHelpContext = createContext(false);

export function ActionHelpProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <ActionHelpContext.Provider value={enabled}>{children}</ActionHelpContext.Provider>;
}

/** The help button is deliberately separate from the field/action: touch never executes it. */
export function InformativeHelp({ children, text, action = false }: {
  children: ReactNode; text?: string; action?: boolean;
}) {
  const enabled = useContext(ActionHelpContext);
  const [open, setOpen] = useState(false);
  const id = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const visible = Boolean(text) && (!action || enabled);
  function show() {
    clearTimeout(closeTimer.current);
    if (visible) setOpen(true);
  }
  function hide() {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }
  return (
    <span className="inline-flex max-w-full items-center gap-1 align-middle" onMouseEnter={show}
      onMouseLeave={hide} onFocusCapture={action ? show : undefined}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      {children}
      {visible && (
        <Tooltip open={open} triggerId={`${id}-trigger`} onOpenChange={setOpen}>
          <TooltipTrigger id={`${id}-trigger`} closeOnClick={false} type="button" aria-label={action ? "Ajuda sobre esta ação" : "Ajuda sobre este campo"}
            aria-describedby={open ? id : undefined}
            className="print:hidden inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(true); }}>
            <span aria-hidden="true">?</span>
          </TooltipTrigger>
          <TooltipContent id={id} onMouseEnter={show} onMouseLeave={hide} className="print:hidden whitespace-normal text-left">{text}</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

export function HelpLabel({ help, ...props }: ComponentProps<"label"> & { help: string }) {
  return <InformativeHelp text={help}><label {...props} /></InformativeHelp>;
}

export function NativeActionButton({ help, ...props }: ComponentProps<"button"> & { help: string }) {
  return <InformativeHelp text={help} action><button {...props} /></InformativeHelp>;
}
