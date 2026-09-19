import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/modules/auth/dal";
import { isBootstrapOpen } from "@/modules/auth/first-user/queries";
import { FirstUserForm } from "./first-user-form";

export const metadata: Metadata = { title: "Primeiro acesso — TechLab+ Fisio OrtoSport" };

export default async function PrimeiroAcessoPage() {
  if (await getCurrentUser()) redirect("/");
  // Já existe usuário: a regra do primeiro cadastro não vale mais e a rota deixa de existir.
  if (!(await isBootstrapOpen())) notFound();

  return (
    <main className="flex flex-1 items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--color-accent),transparent_60%)] px-4 py-16">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <BrandLogo className="mb-4" />
          <CardTitle>
            <h1 className="sr-only">Fisio OrtoSport</h1>
            <span className="text-lg font-semibold">Primeiro acesso</span>
          </CardTitle>
          <CardDescription>
            Ainda não há nenhuma conta neste sistema. Crie a sua: ela será a conta de
            Administrador, e esta tela deixa de existir depois disso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FirstUserForm />
        </CardContent>
      </Card>
    </main>
  );
}
