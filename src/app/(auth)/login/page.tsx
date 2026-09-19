import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/modules/auth/dal";
import { listDevUsers } from "@/modules/auth/dev-login";
import { safeRedirectPath } from "@/modules/auth/redirect-path";
import { hasAnyUser } from "@/modules/auth/setup";
import { DevUserPicker } from "./dev-user-picker";
import { LoginForm } from "./login-form";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Entrar — TechLab+ Fisio OrtoSport" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeRedirectPath(next);
  if (await getCurrentUser()) redirect(nextPath);

  // Sem nenhum usuário no banco, o login dá lugar ao cadastro do primeiro Administrador.
  const needsSetup = !(await hasAnyUser());
  const devUsers = !needsSetup && process.env.NODE_ENV === "development" ? await listDevUsers() : [];

  return (
    <main className="flex flex-1 items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--color-accent),transparent_60%)] px-4 py-16">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <BrandLogo className="mb-4" />
          <CardTitle>
            <h1 className="sr-only">Fisio OrtoSport</h1>
            <span className="text-lg font-semibold">{needsSetup ? "Primeiro acesso" : "Acesse sua conta"}</span>
          </CardTitle>
          <CardDescription>
            {needsSetup
              ? "Nenhum usuário cadastrado. Crie a conta do Administrador para começar."
              : "Entre com seu e-mail e senha."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {needsSetup ? (
            <SetupForm next={nextPath} />
          ) : (
            <>
              <LoginForm next={nextPath} />
              <DevUserPicker users={devUsers} next={nextPath} />
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
