import { redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";

export default async function ContratosPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("administrativo:configurar");
  const { id } = await params;
  redirect(`/configuracoes/operadoras/${id}`);
}
