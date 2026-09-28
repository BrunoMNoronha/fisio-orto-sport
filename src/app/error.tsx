"use client";

import { ErrorFallback } from "@/components/error-fallback";

// Falha fora de uma página com menu, inclusive no layout da área autenticada (por exemplo, banco sem
// uma coluna esperada ao ler o nome da clínica).
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-24">
      <ErrorFallback digest={error.digest} retry={retry} />
    </main>
  );
}
