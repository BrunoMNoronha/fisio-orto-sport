"use server";

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { safeRedirectPath } from "./redirect-path";
import { createSession, deleteSession } from "./session";

// Acesso rápido: existe só em `next dev`. Em produção as actions não fazem nada.
function isDev() {
  return process.env.NODE_ENV === "development";
}

export async function listDevUsers() {
  if (!isDev()) return [];
  return prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
}

export async function devLogin(formData: FormData) {
  if (!isDev()) notFound();

  const userId = formData.get("userId");
  if (typeof userId !== "string" || !userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, active: true },
  });
  if (!user || !user.active) redirect("/login");

  await deleteSession();
  if (!(await createSession(user.id, user.passwordHash))) redirect("/login");
  redirect(safeRedirectPath(formData.get("next")));
}
