import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Página não encontrada — TechLab+ Fisio OrtoSport" };

// 404 dentro da área autenticada (issue #47): `notFound()` das páginas cai aqui, com o menu ao lado,
// em vez da página padrão do Next em inglês.
export default function NotFound() {
  return (
    <div className="flex max-w-md flex-col items-start gap-4 py-12">
      <p className="text-sm font-medium text-muted-foreground">Erro 404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="text-muted-foreground">
        O endereço não existe ou o registro não está mais disponível. Confira o link ou volte para
        a lista.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link href="/pacientes" />}>Ir para pacientes</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}>Voltar ao início</Button>
      </div>
    </div>
  );
}
