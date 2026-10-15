import { redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";
import { RECEIVABLES_PATH } from "./report-common";

export default async function ReportsPage({ searchParams }: PageProps<"/financeiro/relatorios">) {
  await requirePermission("financeiro:ler");
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.append(name, value);
    else value?.forEach((item) => query.append(name, item));
  }
  const suffix = query.toString();
  redirect(suffix ? `${RECEIVABLES_PATH}?${suffix}` : RECEIVABLES_PATH);
}
