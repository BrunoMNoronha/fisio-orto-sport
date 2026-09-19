import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/modules/auth/dal";
import { getPatient } from "@/modules/pacientes/queries";
import { PrintButton } from "../../print-button";

// Documentos do paciente para impressão: fora do shell do app (sem sidebar), só a barra de
// ações (oculta na impressão) e a folha. A autorização é refeita aqui e em cada página.
export default async function ImpressaoPacienteLayout({ children, params }: LayoutProps<"/impressao/pacientes/[id]">) {
  await requirePermission("pacientes:ler");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-muted print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur print:hidden">
        <Link href={`/pacientes/${patient.id}/documentos`} className={buttonVariants({ variant: "ghost" })}>
          <ArrowLeftIcon />
          Voltar à ficha
        </Link>
        <PrintButton />
      </div>
      <main className="flex-1 overflow-x-auto py-8 print:overflow-visible print:p-0">{children}</main>
    </div>
  );
}
