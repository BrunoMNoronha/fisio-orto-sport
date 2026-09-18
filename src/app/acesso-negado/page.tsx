import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Acesso negado — TechLab+ Fisio OrtoSport" };

// Página 403. Não usamos `forbidden()` porque ainda é experimental no Next 16.3.
export default function AcessoNegadoPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-4 px-6 py-24">
      <p className="text-sm font-medium text-muted-foreground">Erro 403</p>
      <h1 className="text-2xl font-semibold tracking-tight">Acesso negado</h1>
      <p className="text-muted-foreground">
        Seu perfil não tem permissão para acessar esta página. Se precisar desse acesso, fale com o
        Administrador.
      </p>
      <Button render={<Link href="/" />}>Voltar ao início</Button>
    </main>
  );
}
