"use client";

import { NativeSelect } from "@/components/ui/native-select";

// Envia o formulário GET ao trocar a opção; o botão do formulário continua como alternativa sem JS.
export function AutoSubmitSelect(props: React.ComponentProps<typeof NativeSelect>) {
  return <NativeSelect {...props} onChange={(event) => event.currentTarget.form?.requestSubmit()} />;
}
