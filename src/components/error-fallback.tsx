"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Conteúdo das telas de erro inesperado (issue #47), no lugar da página padrão do Next em inglês. Em
// produção a mensagem do erro não chega ao cliente; só o `digest`, que casa com o log do servidor.
export function ErrorFallback({ digest, retry }: { digest?: string; retry: () => void }) {
  return (
    <div role="alert" className="flex max-w-md flex-col items-start gap-4">
      <p className="text-sm font-medium text-muted-foreground">Erro inesperado</p>
      <h1 className="text-2xl font-semibold tracking-tight">Não foi possível carregar esta página</h1>
      <p className="text-muted-foreground">
        Ocorreu uma falha ao exibir os dados. Tente novamente; se o problema continuar, informe o
        código abaixo ao suporte.
      </p>
      {digest ? (
        <p className="text-sm text-muted-foreground">
          Código: <span className="font-mono">{digest}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => retry()}>Tentar novamente</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}>Voltar ao início</Button>
      </div>
    </div>
  );
}
