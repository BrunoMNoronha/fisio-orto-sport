import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { logout } from "@/modules/auth/actions";
import { requireUser } from "@/modules/auth/dal";
import { ROLE_LABELS, can } from "@/modules/auth/permissions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav aria-label="Principal" className="flex items-center gap-4">
            <Link href="/" className="font-semibold tracking-tight">
              Fisio OrtoSport
            </Link>
            {can(user.role, "usuarios:ler") && (
              <Link href="/usuarios" className="text-sm text-muted-foreground hover:text-foreground">
                Usuários
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm">{user.name}</span>
            <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Sair
              </Button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
