import { ActionHelpProvider } from "@/components/informative-help";
import { requireUser } from "@/modules/auth/dal";
import { getActionTooltipsEnabled } from "@/modules/configuracoes/queries";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <ActionHelpProvider enabled={await getActionTooltipsEnabled()}>{children}</ActionHelpProvider>;
}
