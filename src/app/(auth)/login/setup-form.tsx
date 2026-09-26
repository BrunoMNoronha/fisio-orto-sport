"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setupFirstAdmin } from "@/modules/auth/actions";
import { PASSWORD_MIN } from "@/modules/auth/validation";

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}

// Só aparece quando não existe nenhum usuário e SETUP_TOKEN está configurado; cria o primeiro
// Administrador e já entra. O código nunca volta no estado (o campo é limpo a cada envio).
export function SetupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(setupFirstAdmin, undefined);
  const errors = state?.fieldErrors;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state?.error && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="setupToken">Código de configuração</Label>
        <Input
          id="setupToken"
          name="setupToken"
          type="password"
          autoComplete="off"
          aria-describedby="setupToken-ajuda"
          required
          autoFocus
        />
        <p id="setupToken-ajuda" className="text-sm text-muted-foreground">
          Fornecido pelo responsável técnico.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          defaultValue={state?.values?.name}
          aria-invalid={errors?.name ? true : undefined}
          aria-describedby={errors?.name ? "name-erro" : undefined}
          required
        />
        <FieldError id="name-erro" messages={errors?.name} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state?.values?.email}
          aria-invalid={errors?.email ? true : undefined}
          aria-describedby={errors?.email ? "email-erro" : undefined}
          required
        />
        <FieldError id="email-erro" messages={errors?.email} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          aria-invalid={errors?.password ? true : undefined}
          aria-describedby={errors?.password ? "password-erro" : "password-ajuda"}
          required
        />
        <FieldError id="password-erro" messages={errors?.password} />
        {!errors?.password && (
          <p id="password-ajuda" className="text-sm text-muted-foreground">
            Mínimo de {PASSWORD_MIN} caracteres.
          </p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Cadastrando…" : "Criar conta e entrar"}
      </Button>
    </form>
  );
}
