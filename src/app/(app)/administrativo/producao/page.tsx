import Link from "next/link";
import { listProduction } from "@/modules/administrativo/production-queries";
import { Search, Pagination } from "../ui";
export default async function ProductionPage({searchParams}:{searchParams:Promise<{q?:string;page?:string;pendentes?:string}>}){
 const search=await searchParams,result=await listProduction({q:search.q,page:search.page},search.pendentes==='true');
 return <div className="mx-auto flex max-w-3xl flex-col gap-4"><h1 className="text-2xl font-semibold">Produção administrativa</h1>
 <p>Prepare e confira explicitamente os procedimentos executados. Presença e sessão não geram cobrança.</p>
 <div className="flex gap-4"><Link href="/administrativo/producao">Sessões</Link><Link href="/administrativo/producao?pendentes=true">Fila de pendências</Link></div>
 <Search label="Buscar paciente pelo nome" q={search.q} hidden={{pendentes:String(search.pendentes==='true')}}/>
 {!result?<p role="alert">Filtros inválidos.</p>:<><p>{result.total} sessão(ões)</p>{result.items.map(s=><Link className="rounded border p-3" key={s.id} href={`/administrativo/producao/${s.id}`}>{s.patient.fullName} — {s.occurredAt.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}<span className="block">{s.professionalNameSnapshot} — {s.status}</span></Link>)}
 <Pagination page={result.page} pages={result.pages} href={`/administrativo/producao?q=${encodeURIComponent(search.q??'')}&pendentes=${search.pendentes==='true'}`}/></>}
 </div>;
}
