import Link from "next/link";
import { requirePermission } from "@/modules/auth/dal";
export default async function GuideProfiles() { await requirePermission('administrativo:configurar'); return <div className="mx-auto flex max-w-3xl flex-col gap-4"><h1 className="text-2xl font-semibold">Perfis de guia SP/SADT</h1><p>Selecione uma operadora e um contrato para configurar seu perfil versionado de campos e códigos.</p><Link className="underline" href="/configuracoes/operadoras">Abrir operadoras e contratos</Link></div>; }
