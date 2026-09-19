"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// A impressão do navegador também permite "Salvar como PDF".
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <PrinterIcon />
      Imprimir / Salvar em PDF
    </Button>
  );
}
