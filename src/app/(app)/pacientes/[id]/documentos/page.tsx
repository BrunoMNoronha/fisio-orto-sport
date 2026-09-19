import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardListIcon, FileSignatureIcon, IdCardIcon, PrinterIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requirePermission } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { getCurrentAnamnesis } from "@/modules/clinico/queries";
import { getPatient } from "@/modules/pacientes/queries";

export const metadata: Metadata = { title: "Documentos do paciente — TechLab+ Fisio OrtoSport" };

type DocumentItem = {
  slug: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  unavailable?: string;
};

// Documentos gerados na hora a partir do cadastro (nada fica salvo no servidor).
// Cada um abre em nova aba, pronto para imprimir ou salvar em PDF pelo navegador.
export default async function DocumentosPacientePage({ params }: PageProps<"/pacientes/[id]/documentos">) {
  const actor = await requirePermission("pacientes:ler");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const documents: DocumentItem[] = [
    {
      slug: "termo-consentimento",
      title: "Termo de consentimento",
      description: "Termo de ciência e consentimento para o tratamento, preenchido com os dados do paciente.",
      icon: FileSignatureIcon,
    },
    {
      slug: "cartao-frequencia",
      title: "Cartão de frequência",
      description: "Folha A4 com 4 cartões de 20 sessões para assinatura do paciente.",
      icon: IdCardIcon,
    },
  ];
  if (can(actor.role, "clinico:ler")) {
    const anamnesis = await getCurrentAnamnesis(patient.id);
    documents.push({
      slug: "anamnese",
      title: "Ficha de anamnese",
      description: "Anamnese vigente do paciente, com assinatura do fisioterapeuta.",
      icon: ClipboardListIcon,
      unavailable: anamnesis ? undefined : "Nenhuma anamnese registrada.",
    });
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {documents.map(({ slug, title, description, icon: Icon, unavailable }) => (
        <li key={slug} className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Icon className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="font-medium">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          {unavailable ? (
            <p className="mt-auto text-sm text-muted-foreground">{unavailable}</p>
          ) : (
            <Link
              href={`/impressao/pacientes/${patient.id}/${slug}`}
              target="_blank"
              className={buttonVariants({ variant: "outline", className: "mt-auto self-start" })}
            >
              <PrinterIcon />
              Abrir para imprimir
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
