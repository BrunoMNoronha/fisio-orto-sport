'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {prisma} from '@/lib/db';
import {assertPermission,AuthorizationError} from '@/modules/auth/dal';
import {settlementSchema} from './settlement-validation';
import {saveSettlement} from './settlement-service';
import {AdministrativeConfigError} from './service';

export type SettlementActionState={error:string}|undefined;
export async function saveSettlementAction(_previous:SettlementActionState,form:FormData):Promise<SettlementActionState>{
  let actor;
  try{actor=await assertPermission('administrativo:conciliar');}catch(error){if(error instanceof AuthorizationError)return {error:'Acesso negado.'};throw error;}
  for(const key of form.keys())if(form.getAll(key).length!==1)return {error:'Campo repetido. Recarregue o formulário.'};
  const raw=Object.fromEntries([...form].filter(([key])=>!key.startsWith('$ACTION_')));
  let lines:unknown;
  try{if(typeof raw.lines!=='string'||raw.lines.length>400000)return {error:'Alocações inválidas ou excessivas.'};lines=JSON.parse(raw.lines);}catch{return {error:'Alocações inválidas.'};}
  const parsed=settlementSchema.safeParse({...raw,lines});
  if(!parsed.success)return {error:parsed.error.issues[0].message};
  let id:string;
  try{id=await saveSettlement(prisma,actor.id,parsed.data);}catch(error){
    if(error instanceof AdministrativeConfigError)return {error:error.message};
    console.error('[conciliacao] falha transacional');
    return {error:'Não foi possível confirmar o movimento. Nenhuma alteração foi gravada.'};
  }
  revalidatePath('/administrativo/conciliacao','layout');
  redirect('/administrativo/conciliacao/registros/'+id);
}
