import type { Metadata } from "next";
import { requirePermission } from "@/modules/auth/dal";
import { listProfessionals } from "@/modules/agenda/queries";
import { isValidDate, toLocalDate } from "@/modules/agenda/validation";
import { firstParam } from "@/modules/pacientes/validation";
import { BlockForm } from "../block-form";

export const metadata: Metadata = { title: "Novo bloqueio — TechLab+ Fisio OrtoSport" };

export default async function NovoBloqueioPage({ searchParams }: PageProps<"/agenda/bloqueios/novo">) {
  await requirePermission("agenda:gerir");
  const raw = await searchParams;
  const professionalId = firstParam(raw.professionalId);
  const date = firstParam(raw.date);
  const professionals = await listProfessionals();
  const day = date && isValidDate(date) ? date : toLocalDate(new Date());

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Novo bloqueio de horário</h1>
      <BlockForm
        initial={{
          professionalId: professionals.some((p) => p.id === professionalId) ? (professionalId ?? "") : "",
          startDate: day,
          startTime: "",
          endDate: day,
          endTime: "",
        }}
        professionals={professionals.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
