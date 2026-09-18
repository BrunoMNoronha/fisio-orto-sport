import { AppBreadcrumb } from "@/components/app-breadcrumb";
import { AppSidebar, type NavKey } from "@/components/app-sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireUser } from "@/modules/auth/dal";
import { ROLE_LABELS, can } from "@/modules/auth/permissions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  const allowed: NavKey[] = ["inicio"];
  if (can(user.role, "pacientes:ler")) allowed.push("pacientes");
  if (can(user.role, "agenda:ler")) allowed.push("agenda");
  if (can(user.role, "usuarios:ler")) allowed.push("usuarios");

  return (
    <SidebarProvider>
      <AppSidebar
        allowed={allowed}
        user={{ name: user.name, email: user.email, roleLabel: ROLE_LABELS[user.role] }}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 rounded-t-xl border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4" />
          <AppBreadcrumb />
          <div className="ml-auto">
            <ModeToggle />
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
