// Indicadores financeiros da página inicial com sessão. Diferente das demais leituras do módulo,
// não redireciona nem audita: sem sessão ou sem `financeiro:ler` a seção simplesmente não aparece.
import "server-only";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/modules/auth/dal";
import { can } from "@/modules/auth/permissions";
import { readFinanceKpis, type FinanceKpis } from "./kpi-read";

export type { FinanceKpis } from "./kpi-read";

export async function getFinanceKpis(now?: Date): Promise<FinanceKpis | null> {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "financeiro:ler")) return null;
  return readFinanceKpis(prisma, now);
}
