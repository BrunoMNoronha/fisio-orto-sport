import Link from "next/link";
import {requirePermission} from "@/modules/auth/dal";
export default async function Page(){await requirePermission('administrativo:configurar');return <div className="mx-auto max-w-3xl space-y-4"><h1 className="text-2xl font-semibold">Perfis XML TISS</h1><p>Selecione o contrato em Operadoras e contratos e abra seu perfil XML. O default técnico do ambiente é homologação em 4.03.00; aceite da operadora permanece explícito.</p><Link className="underline" href="/configuracoes/operadoras">Abrir operadoras e contratos</Link></div>;}
