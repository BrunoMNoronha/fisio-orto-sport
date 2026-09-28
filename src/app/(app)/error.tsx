"use client";

import { ErrorFallback } from "@/components/error-fallback";

// Falha ao carregar uma página da área autenticada: mantém o menu. Falhas no próprio layout da área
// (sessão, nome da clínica) sobem para `app/error.tsx`.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="py-12">
      <ErrorFallback digest={error.digest} retry={retry} />
    </div>
  );
}
