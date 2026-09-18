"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getDummyHash, verifyPassword } from "./password";
import { safeRedirectPath } from "./redirect-path";
import { createSession, deleteSession } from "./session";
import { loginSchema } from "./validation";

export type LoginState = { error?: string; email?: string } | undefined;

const GENERIC_LOGIN_ERROR = "E-mail ou senha inválidos.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const typedEmail = typeof formData.get("email") === "string" ? String(formData.get("email")) : "";
  if (!parsed.success) return { error: GENERIC_LOGIN_ERROR, email: typedEmail };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true, active: true },
  });

  // Sempre executa o scrypt, mesmo sem usuário, para não revelar por tempo se o e-mail existe.
  const passwordOk = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !user.active || !passwordOk) return { error: GENERIC_LOGIN_ERROR, email: typedEmail };

  await deleteSession(); // descarta uma sessão anterior neste navegador, se houver
  await createSession(user.id);
  redirect(safeRedirectPath(formData.get("next")));
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
