import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getGuideProfile } from "@/modules/administrativo/guide-queries";
import { DEFAULT_GUIDE_RULES, guideRulesSchema } from "@/modules/administrativo/guide-validation";
import { GuideProfileForm } from "./profile-form";
export default async function ProfilePage({ params }: { params: Promise<{ contractId: string }> }) { const { contractId } = await params, data = await getGuideProfile(contractId); if (!data) notFound(); const parsed = guideRulesSchema.safeParse(data.profile?.rules); return <div className="mx-auto flex max-w-3xl flex-col gap-5"><h1 className="text-2xl font-semibold">Perfil de guia · {data.contract.name}</h1><p>Versão {data.profile?.version ?? 0}. Dados da operadora, prestador e TISS são configurados no contrato. Os tetos do contrato continuam aplicáveis.</p><GuideProfileForm contractId={contractId} id={randomUUID()} requestId={randomUUID()} version={data.profile?.version ?? 0} rules={parsed.success ? parsed.data : DEFAULT_GUIDE_RULES} reference={data.profile?.reference ?? ''} /></div>; }
