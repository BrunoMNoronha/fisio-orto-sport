import { notFound } from "next/navigation";
import { getProfessional } from "@/modules/administrativo/catalog-queries";
import { ProfessionalEditor } from "../professional-editor";
export default async function Professional({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const item = await getProfessional((await params).id);
  if (!item) notFound();
  return <ProfessionalEditor item={item} q={(await searchParams).q} />;
}
