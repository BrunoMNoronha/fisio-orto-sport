import {createHash,randomUUID} from 'node:crypto';
import type {Prisma,PrismaClient} from '@/generated/prisma/client';
import {AdministrativeConfigError} from './service';
import type {SettlementInput} from './settlement-validation';
import {MAX_SETTLEMENT_CENTS} from './settlement-validation';

type Tx=Prisma.TransactionClient;
type Deltas={receivedDelta:bigint;analysisDelta:bigint;writtenOffDelta:bigint;billedDelta:bigint};
const fail=(message:string):never=>{throw new AdministrativeConfigError(message);};
const json=(value:unknown)=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?String(item):item);
export async function lockSettlement(tx:Tx,contractId:string){
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'administrativo:conciliacao:'+contractId},0))`;
}
export function settlementDeltas(kind:SettlementInput['kind'],amount:bigint,fromGlosa:boolean):Deltas {
  const delta={receivedDelta:BigInt("0"),analysisDelta:BigInt("0"),writtenOffDelta:BigInt("0"),billedDelta:BigInt("0")};
  if(kind==='RECEBER'||kind==='SUBSTITUIR'){delta.receivedDelta=amount;if(fromGlosa)delta.analysisDelta=-amount;}
  if(kind==='GLOSAR')delta.analysisDelta=amount;
  if(kind==='LIBERAR')delta.analysisDelta=-amount;
  if(kind==='DEFINIR'){delta.analysisDelta=-amount;delta.writtenOffDelta=amount;}
  if(kind==='REABRIR'){delta.analysisDelta=amount;delta.writtenOffDelta=-amount;}
  if(kind==='AJUSTAR')delta.billedDelta=amount;
  return delta;
}
export async function receivableBalance(tx:Tx,id:string){
  const item=await tx.operatorReceivable.findUnique({where:{id}});
  if(!item)return null;
  const {_sum:s}=await tx.operatorSettlementLine.aggregate({where:{receivableId:id},_sum:{receivedDelta:true,analysisDelta:true,writtenOffDelta:true,billedDelta:true}});
  const received=s.receivedDelta??BigInt("0"),analysis=s.analysisDelta??BigInt("0"),writtenOff=s.writtenOffDelta??BigInt("0"),adjustment=s.billedDelta??BigInt("0"),billed=item.amountCents+adjustment;
  return {...item,received,analysis,writtenOff,adjustment,billed,open:billed-received-analysis-writtenOff};
}
export async function glosaBalance(tx:Tx,id:string){
  const original=await tx.operatorSettlementLine.findUnique({where:{id},include:{settlement:{select:{kind:true,effectiveOn:true}}}});
  if(!original||original.settlement.kind!=='GLOSAR'||original.glosaRootId)return null;
  const {_sum:s}=await tx.operatorSettlementLine.aggregate({where:{glosaRootId:id},_sum:{analysisDelta:true,writtenOffDelta:true}});
  const analysis=original.analysisDelta+(s.analysisDelta??BigInt("0")),writtenOff=s.writtenOffDelta??BigInt("0");
  return {...original,analysis,writtenOff,state:analysis>BigInt("0")?'EM_ANALISE':writtenOff>BigInt("0")?'DEFINITIVA':'REVERTIDA'};
}
export async function saveSettlement(db:Pick<PrismaClient,'$transaction'>,actorId:string,input:SettlementInput){
  const canonical={...input,lines:[...input.lines].sort((a,b)=>(a.receivableId+':'+a.glosaRootId).localeCompare(b.receivableId+':'+b.glosaRootId))};
  const fingerprint=createHash('sha256').update(json(canonical)).digest('hex');
  try{return await db.$transaction(async tx=>{
    await lockSettlement(tx,input.contractId);
    const replay=await tx.operatorSettlement.findUnique({where:{requestId:input.requestId}});
    if(replay){if(replay.fingerprint!==fingerprint)fail('Solicitação reutilizada com outros dados.');return replay.id;}
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
    if(input.effectiveOn.toISOString().slice(0,10)>today)fail('Data efetiva não pode ser futura.');
    const contract=await tx.operatorContract.findUnique({where:{id:input.contractId},select:{maxItems:true}});
    if(!contract)fail('Contrato inexistente.');
    if(input.lines.length>Math.min(contract!.maxItems,1000))fail('Alocações excedem o limite do contrato ou o limite técnico de 1.000 linhas. Divida o registro.');
    const pending:Array<Prisma.OperatorSettlementLineCreateManyInput>=[];
    if(input.reversesId){
      const source=await tx.operatorSettlement.findUnique({where:{id:input.reversesId},include:{reversedBy:{select:{id:true}},lines:{where:{reversalPart:false}}}});
      if(!source||source.contractId!==input.contractId||!['RECEBER','SUBSTITUIR'].includes(source.kind)||source.reversedBy)fail('Recebimento original indisponível, de outro contrato ou já estornado/substituído.');
      if(input.effectiveOn<source!.effectiveOn)fail('Data efetiva não pode anteceder o recebimento original.');
      if(input.kind==='ESTORNAR'&&input.amount!==source!.amountCents)fail('Estorno deve corresponder ao valor integral do recebimento.');
      for(const line of source!.lines)pending.push({id:randomUUID(),settlementId:input.id,receivableId:line.receivableId,glosaRootId:line.glosaRootId,code:line.code,reversalPart:true,receivedDelta:-line.receivedDelta,analysisDelta:-line.analysisDelta,writtenOffDelta:-line.writtenOffDelta,billedDelta:-line.billedDelta});
    }
    for(const line of input.lines)pending.push({id:randomUUID(),settlementId:input.id,receivableId:line.receivableId,glosaRootId:line.glosaRootId,code:line.code,reversalPart:false,...settlementDeltas(input.kind,line.amount,!!line.glosaRootId)});
    // Conferir o resultado inteiro (incluindo estorno+substituto) antes de gravar.
    for(const root of [...new Set(pending.map(line=>line.glosaRootId).filter((id):id is string=>!!id))]){
      const glosa=await glosaBalance(tx,root);
      if(!glosa)fail('Glosa original inexistente.');
      let analysis=glosa!.analysis,writtenOff=glosa!.writtenOff;
      for(const line of pending.filter(line=>line.glosaRootId===root)){
        if(line.receivableId!==glosa!.receivableId)fail('Glosa não pertence ao item selecionado.');
        analysis+=BigInt(line.analysisDelta??0);writtenOff+=BigInt(line.writtenOffDelta??0);
      }
      if(input.effectiveOn<glosa!.settlement.effectiveOn||analysis<BigInt("0")||writtenOff<BigInt("0")||analysis+writtenOff>glosa!.analysisDelta)fail('Saldo da glosa insuficiente ou data anterior à glosa. Reabra a baixa definitiva antes de receber esse valor.');
    }
    for(const id of [...new Set(pending.map(line=>line.receivableId))].sort()){
      const balance=await receivableBalance(tx,id);
      if(!balance||balance.contractId!==input.contractId)fail('Item faturado inexistente ou de outro contrato.');
      if(input.effectiveOn<balance!.billedOn)fail('Data efetiva não pode anteceder o primeiro envio do item.');
      const result={received:balance!.received,analysis:balance!.analysis,writtenOff:balance!.writtenOff,billed:balance!.billed};
      for(const line of pending.filter(line=>line.receivableId===id)){result.received+=BigInt(line.receivedDelta??0);result.analysis+=BigInt(line.analysisDelta??0);result.writtenOff+=BigInt(line.writtenOffDelta??0);result.billed+=BigInt(line.billedDelta??0);}
      if(Object.values(result).some(value=>value<BigInt("0")||value>MAX_SETTLEMENT_CENTS)||result.received+result.analysis+result.writtenOff>result.billed)fail('Saldo do item insuficiente. Revise a classificação e as alocações; nenhum excedente é aceito.');
    }
    await tx.operatorSettlement.create({data:{id:input.id,contractId:input.contractId,kind:input.kind,effectiveOn:input.effectiveOn,reference:input.reference,reason:input.reason,amountCents:input.amount,actorId,requestId:input.requestId,fingerprint,reversesId:input.reversesId}});
    await tx.operatorSettlementLine.createMany({data:pending});
    return input.id;
  },{timeout:60000});}catch(error){
    if(error instanceof AdministrativeConfigError)throw error;
    if(typeof error==='object'&&error&&'code'in error&&error.code==='P2002')fail('Recebimento já estornado/substituído ou solicitação já utilizada.');
    throw error;
  }
}
