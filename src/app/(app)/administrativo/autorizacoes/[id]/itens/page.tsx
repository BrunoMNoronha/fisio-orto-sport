import { redirect } from "next/navigation";
export default async function ItemsPage({params}:{params:Promise<{id:string}>}){redirect(`/administrativo/autorizacoes/${(await params).id}`);}
