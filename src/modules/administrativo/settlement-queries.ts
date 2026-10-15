import 'server-only';
import {z} from 'zod';
import {prisma} from '@/lib/db';
import {requirePermission} from '@/modules/auth/dal';
import {can} from '@/modules/auth/permissions';
import {settlementFilters} from './settlement-validation';
import {batchParams} from './batch-validation';
import {readSettlementWorkspace} from './settlement-read';

export async function getSettlementWorkspace(raw:unknown){
  const actor=await requirePermission('administrativo:ler');
  const parsed=settlementFilters.safeParse(batchParams(raw));
  if(!parsed.success)return {error:'Filtros inválidos.',workspace:null,contracts:[],canManage:false};
  // Lista somente contratos com obrigação enviada; cadastros inativos continuam conciliáveis.
  const contracts=await prisma.operatorContract.findMany({where:{receivables:{some:{}}},select:{id:true,name:true,operator:{select:{name:true}}},orderBy:[{name:'asc'},{id:'asc'}]});
  const workspace=parsed.data.contractId?await readSettlementWorkspace(prisma,parsed.data):null;
  return {error:parsed.data.contractId&&!workspace?'Contrato não encontrado.':null,workspace,contracts,canManage:can(actor.role,'administrativo:conciliar')};
}
export async function getSettlementRecord(id:string){
  const actor=await requirePermission('administrativo:ler');
  if(!z.uuid().safeParse(id).success)return null;
  const record=await prisma.operatorSettlement.findUnique({where:{id},select:{id:true,kind:true,contractId:true,contract:{select:{name:true,operator:{select:{name:true}}}},effectiveOn:true,reference:true,reason:true,amountCents:true,createdAt:true,reversesId:true,reversedBy:{select:{id:true}},actor:{select:{id:true,name:true}},lines:{select:{id:true,receivableId:true,glosaRootId:true,code:true,reversalPart:true,receivedDelta:true,analysisDelta:true,writtenOffDelta:true,billedDelta:true},orderBy:{id:'asc'}}}});
  return record?{record,canManage:can(actor.role,'administrativo:conciliar')}:null;
}
