"use client";

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Role } from "@/generated/prisma/enums";
import { ROLES, ROLE_LABELS } from "@/modules/auth/permissions";
import {
  createUser,
  resetPassword,
  setUserActive,
  updateUser,
  type UserActionState,
} from "@/modules/auth/users/actions";
import { PASSWORD_MIN } from "@/modules/auth/validation";

type UserRow = { id: string; name: string; email: string; role: Role; active: boolean };
type Action = (prev: UserActionState, formData: FormData) => Promise<UserActionState>;

// Envolve a action para fechar o diálogo quando ela conclui com sucesso.
function useDialogAction(action: Action) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: UserActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result?.ok) setOpen(false);
    return result;
  }, undefined);
  return { open, setOpen, state, formAction, pending };
}

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}

function Field({
  id,
  label,
  errors,
  children,
}: {
  id: string;
  label: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError id={`${id}-erro`} messages={errors} />
    </div>
  );
}

function FormError({ state }: { state: UserActionState }) {
  if (!state?.error) return null;
  return (
    <Alert variant="destructive" aria-live="polite">
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  );
}

function RoleSelect({ id, defaultValue, errors }: { id: string; defaultValue?: Role; errors?: string[] }) {
  return (
    <NativeSelect
      id={id}
      name="role"
      defaultValue={defaultValue ?? ""}
      required
      aria-invalid={errors ? true : undefined}
      aria-describedby={errors ? `${id}-erro` : undefined}
      className="w-full"
    >
      <NativeSelectOption value="" disabled>
        Selecione o perfil
      </NativeSelectOption>
      {ROLES.map((role) => (
        <NativeSelectOption key={role} value={role}>
          {ROLE_LABELS[role]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function inputA11y(id: string, errors?: string[]) {
  return {
    id,
    "aria-invalid": errors ? true : undefined,
    "aria-describedby": errors ? `${id}-erro` : undefined,
  } as const;
}

export function CreateUserDialog() {
  const { open, setOpen, state, formAction, pending } = useDialogAction(createUser);
  const errors = state?.fieldErrors;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Novo usuário</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            Defina uma senha inicial com pelo menos {PASSWORD_MIN} caracteres e entregue-a ao usuário.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <FormError state={state} />
          <Field id="novo-nome" label="Nome" errors={errors?.name}>
            <Input {...inputA11y("novo-nome", errors?.name)} name="name" autoComplete="off" required />
          </Field>
          <Field id="novo-email" label="E-mail" errors={errors?.email}>
            <Input {...inputA11y("novo-email", errors?.email)} name="email" type="email" autoComplete="off" required />
          </Field>
          <Field id="novo-perfil" label="Perfil" errors={errors?.role}>
            <RoleSelect id="novo-perfil" errors={errors?.role} />
          </Field>
          <Field id="novo-senha" label="Senha inicial" errors={errors?.password}>
            <Input
              {...inputA11y("novo-senha", errors?.password)}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN}
              required
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : "Criar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditUserDialog({ user }: { user: UserRow }) {
  const { open, setOpen, state, formAction, pending } = useDialogAction(updateUser);
  const errors = state?.fieldErrors;
  const prefix = `editar-${user.id}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Editar<span className="sr-only"> {user.name}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="id" value={user.id} />
          <FormError state={state} />
          <Field id={`${prefix}-nome`} label="Nome" errors={errors?.name}>
            <Input {...inputA11y(`${prefix}-nome`, errors?.name)} name="name" defaultValue={user.name} required />
          </Field>
          <Field id={`${prefix}-perfil`} label="Perfil" errors={errors?.role}>
            <RoleSelect id={`${prefix}-perfil`} defaultValue={user.role} errors={errors?.role} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResetPasswordDialog({ user }: { user: UserRow }) {
  const { open, setOpen, state, formAction, pending } = useDialogAction(resetPassword);
  const errors = state?.fieldErrors;
  const id = `senha-${user.id}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Redefinir senha<span className="sr-only"> de {user.name}</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>
            Nova senha para {user.name}. As sessões abertas desse usuário serão encerradas.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="id" value={user.id} />
          <FormError state={state} />
          <Field id={id} label="Nova senha" errors={errors?.password}>
            <Input
              {...inputA11y(id, errors?.password)}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN}
              required
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : "Redefinir senha"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ToggleActiveButton({ user, disabled }: { user: UserRow; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(setUserActive, undefined);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={user.id} />
      <input type="hidden" name="active" value={user.active ? "false" : "true"} />
      <Button
        type="submit"
        variant={user.active ? "destructive" : "outline"}
        size="sm"
        disabled={pending || disabled}
        title={disabled ? "Você não pode desativar a sua própria conta." : undefined}
      >
        {user.active ? "Desativar" : "Ativar"}
        <span className="sr-only"> {user.name}</span>
      </Button>
      {state?.error && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
