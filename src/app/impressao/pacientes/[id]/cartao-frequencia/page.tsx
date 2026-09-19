import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { requirePermission } from "@/modules/auth/dal";
import { getPatient } from "@/modules/pacientes/queries";
import { FillField, Sheet } from "../../../document-parts";

export async function generateMetadata({
  params,
}: PageProps<"/impressao/pacientes/[id]/cartao-frequencia">): Promise<Metadata> {
  const patient = await getPatient((await params).id);
  return { title: `Cartão de frequência - ${patient?.fullName ?? "Paciente"}` };
}

const COPIES = 4;

function SessionsTable({ from }: { from: number }) {
  return (
    <table className="w-full border-collapse text-[7.5pt]">
      <thead>
        <tr className="h-[6.5mm]">
          <th className="w-[7mm] border border-black/80 font-bold">Nº</th>
          <th className="w-[14mm] border border-black/80 font-bold">DATA</th>
          <th className="border border-black/80 text-[6pt] leading-tight font-bold">ASS. CLIENTE / RESPONSÁVEL</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 10 }, (_, i) => (
          <tr key={i} className="h-[6.8mm]">
            <td className="border border-black/80 pl-1 font-semibold">{from + i}</td>
            <td className="border border-black/80" />
            <td className="border border-black/80" />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Um cartão (1/4 da folha), réplica do modelo impresso da clínica.
function Card({ name }: { name: string }) {
  return (
    <section className="flex h-full flex-col gap-2 rounded-[3mm] border border-black/70 px-[4mm] py-[3.5mm] text-[8pt]">
      <BrandLogo className="justify-center [&_img]:size-10 [&_span.text-3xl]:text-2xl" />
      <FillField label="NOME" value={name} className="mt-1" />
      <FillField label="CONVÊNIO" />
      <div className="mt-1 grid grid-cols-[1.15fr_1fr] gap-[2mm]">
        <SessionsTable from={1} />
        <SessionsTable from={11} />
      </div>
      <div className="mt-auto grid grid-cols-[2fr_3fr] gap-x-3 gap-y-1.5 text-[7.5pt]">
        <FillField label="Pedido entregue" />
        <FillField label="Ass." />
        <FillField label="Aut. solicitada" />
        <FillField label="Nº guia" />
        <FillField label="Aut. solicitada" />
        <FillField label="Nº guia" />
      </div>
    </section>
  );
}

export default async function CartaoFrequenciaPage({ params }: PageProps<"/impressao/pacientes/[id]/cartao-frequencia">) {
  await requirePermission("pacientes:ler");
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  // Folha com 4 cartões iguais (2×2), separados pelo tracejado de corte.
  return (
    <Sheet className="h-[297mm] overflow-hidden p-[8mm]">
      <div className="grid h-full grid-cols-2 grid-rows-2">
        {Array.from({ length: COPIES }, (_, i) => (
          <div
            key={i}
            className={[
              "p-[3mm]",
              i % 2 === 0 ? "border-r border-dashed border-black/40" : "",
              i < 2 ? "border-b border-dashed border-black/40" : "",
            ].join(" ")}
          >
            <Card name={patient.fullName} />
          </div>
        ))}
      </div>
    </Sheet>
  );
}
