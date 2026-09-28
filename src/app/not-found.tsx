import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Página não encontrada — TechLab+ Fisio OrtoSport" };

// 404 de endereços que não casam com nenhuma rota (issue #47), no mesmo formato da página 403. Dentro
// da área autenticada, `notFound()` usa `(app)/not-found.tsx`, que mantém o menu.
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-4 px-6 py-24">
      <p className="text-sm font-medium text-muted-foreground">Erro 404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="text-muted-foreground">O endereço não existe. Confira o link ou volte ao início.</p>
      <Button nativeButton={false} render={<Link href="/" />}>Voltar ao início</Button>
    </main>
  );
}
