import { redirect } from "next/navigation";
import { requirePermission } from "@/modules/auth/dal";
export default async function ReportsPage() { await requirePermission('administrativo:ler'); redirect('/administrativo/relatorios/producao'); }
