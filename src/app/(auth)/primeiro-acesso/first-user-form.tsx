"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerFirstUser } from "@/modules/auth/first-user/actions";
import { PASSWORD_MIN } from "@/modules/auth/validation";

export function FirstUserForm() {
  const [state, action, pending] = useActionState(registerFirstUser, undefined);
  const errors = state?.fieldErrors;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.error && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome</Label>
        <Input
          // Remonta ao receber o valor devolvido pela action (campo não controlado).
          key={`name:${state?.values?.name ?? ""}`}
          id="name"
          name="name"
          autoComplete="name"
          defaultValue={state?.values?.name}
          aria-invalid={errors?.name ? true : undefined}
          aria-describedby={errors?.name ? "name-error" : undefined}
          required
          autoFocus
        />
        {errors?.name && (
          <p id="name-error" className="text-sm text-destructive">
            {errors.name[0]}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          key={`email:${state?.values?.email ?? ""}`}
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state?.values?.email}
          aria-invalid={errors?.email ? true : undefined}
          aria-describedby={errors?.email ? "email-error" : undefined}
          required
        />
        {errors?.email && (
          <p id="email-error" className="text-sm text-destructive">
            {errors.email[0]}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors?.password ? true : undefined}
          aria-describedby={errors?.password ? "password-error" : "password-hint"}
          required
        />
        {errors?.password ? (
          <p id="password-error" className="text-sm text-destructive">
            {errors.password[0]}
          </p>
        ) : (
          <p id="password-hint" className="text-sm text-muted-foreground">
            Pelo menos {PASSWORD_MIN} caracteres.
          </p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Criando…" : "Criar conta de Administrador"}
      </Button>
    </form>
  );
}
