import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/modules/auth/dal";
import { safeRedirectPath } from "@/modules/auth/redirect-path";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar — TechLab+ Fisio OrtoSport" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeRedirectPath(next);
  if (await getCurrentUser()) redirect(nextPath);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="text-sm font-medium text-muted-foreground">TechLab+</p>
          <CardTitle>
            <h1 className="text-2xl font-semibold tracking-tight">Fisio OrtoSport</h1>
          </CardTitle>
          <CardDescription>Entre com seu e-mail e senha.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={nextPath} />
        </CardContent>
      </Card>
    </main>
  );
}
