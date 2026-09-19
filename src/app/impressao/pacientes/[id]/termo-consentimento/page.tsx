import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CLINIC_TIMEZONE } from "@/modules/agenda/validation";
import { requirePermission } from "@/modules/auth/dal";
import { TERMO_SECTIONS, getAttendingPhysio } from "@/modules/pacientes/documents";
import { getPatient } from "@/modules/pacientes/queries";
import { formatCpf, formatPhone } from "@/modules/pacientes/validation";
import { formatDate } from "../../../../(app)/pacientes/format";
import { DocumentHeader, FillField, Sheet, SignatureLine } from "../../../document-parts";

export async function generateMetadata({
  params,
}: PageProps<"/impressao/pacientes/[id]/termo-consentimento">): Promise<Metadata> {
  const patient = await getPatient((await params).id);
  return { title: `Termo de consentimento - ${patient?.fullName ?? "Paciente"}` };
}

// "18 de setembro de 2026", no fuso da clínica.
function longDate(date: Date) {
  return date.toLocaleDateString("pt-BR", { timeZone: CLINIC_TIMEZONE, day: "numeric", month: "long", year: "numeric" });
}

export default async function TermoConsentimentoPage({
  params,
}: PageProps<"/impressao/pacientes/[id]/termo-consentimento">) {
  await requirePermission("pacientes:ler");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();
  const physio = await getAttendingPhysio(patient.id);

  const guardian = patient.guardianName
    ? [patient.guardianName, patient.guardianRelationship].filter(Boolean).join(" — ")
    : null;

  return (
    <Sheet className="flex flex-col gap-4">
      <DocumentHeader
        title={
          <>
            Termo de ciência e consentimento
            <br />
            para o tratamento fisioterapêutico
          </>
        }
      />

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <FillField label="Paciente" value={patient.fullName} className="col-span-2" />
        <FillField label="Data de nascimento" value={formatDate(patient.birthDate)} />
        <FillField label="CPF" value={patient.cpf && formatCpf(patient.cpf)} />
        <FillField label="Telefone" value={formatPhone(patient.phone)} />
        <FillField label="E-mail" value={patient.email} />
        <FillField label="Responsável (se aplicável)" value={guardian} className="col-span-2" />
        <FillField label="Fisioterapeuta" value={physio?.name} />
        <FillField label="CREFITO" value={physio?.crefito} />
      </div>

      <ol className="flex flex-col gap-2.5 text-justify">
        {TERMO_SECTIONS.map((section, index) => (
          <li key={section.title} className="break-inside-avoid">
            <h2 className="font-bold uppercase">
              {index + 1}. {section.title}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="whitespace-pre-wrap">
                {paragraph}
              </p>
            ))}
          </li>
        ))}
      </ol>

      <p className="mt-2">Brasília/DF, {longDate(new Date())}.</p>

      <div className="mt-auto grid grid-cols-2 gap-16 pt-10">
        <SignatureLine label="Paciente / Responsável" />
        <SignatureLine
          label="Fisioterapeuta"
          name={physio && [physio.name, physio.crefito && `CREFITO ${physio.crefito}`].filter(Boolean).join(" · ")}
        />
      </div>
    </Sheet>
  );
}
