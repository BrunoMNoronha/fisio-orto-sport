import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { toLocalDate, toLocalTime } from "@/modules/agenda/validation";
import { lockBeneficiary, consumeAuthorizationTx, returnAuthorizationTx } from "./beneficiary-service";
import { readEligibilityTx } from "./eligibility";
import { readTariffSnapshotTx } from "./catalog-read";
import { AdministrativeConfigError, CONFIG_CONFLICT } from "./service";
import type { ProductionInput } from "./production-validation";

export async function recordProductionChange(tx: Prisma.TransactionClient, itemId: string, actorId: string, reason: string, requestId: string, fingerprint: string) {
  await tx.$executeRaw`INSERT INTO "ProductionChange" (id,"itemId",version,"actorId",reason,"requestId",fingerprint,snapshot)
    SELECT ${randomUUID()},id,version,${actorId},${reason},${requestId},${fingerprint},to_jsonb(i) FROM "ProductionItem" i WHERE id=${itemId}`;
}
export async function saveProduction(db: Pick<PrismaClient, "$transaction">, actorId: string, input: ProductionInput) {
 const fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex");
 try { return await db.$transaction(async tx => {
  const session = await tx.treatmentSession.findUnique({where:{id:input.sessionId},select:{patientId:true}});
  if(!session) throw new AdministrativeConfigError("Atendimento não encontrado.");
  await tx.$queryRaw`SELECT id FROM "Patient" WHERE id=${session.patientId} FOR UPDATE`;
  await lockBeneficiary(tx);
  await tx.$queryRaw`SELECT id FROM "TreatmentSession" WHERE id=${input.sessionId} FOR UPDATE`;
  const replay=await tx.productionChange.findUnique({where:{requestId:input.requestId}});
  if(replay){if(replay.fingerprint!==fingerprint)throw new AdministrativeConfigError("Envio já utilizado com outros dados.");return replay.itemId;}
  const current=await tx.productionItem.findUnique({where:{id:input.id}});
  if((current?.version??0)!==input.expectedVersion)throw new AdministrativeConfigError(CONFIG_CONFLICT);
  if(current && (current.sessionId!==input.sessionId || ['FECHADO','ENVIADO','INVALIDADO'].includes(current.state)))throw new AdministrativeConfigError("Item preservado; correção exige revisão do fluxo de faturamento.");
  const s=await tx.treatmentSession.findUniqueOrThrow({where:{id:input.sessionId},select:{id:true,patientId:true,professionalId:true,professionalNameSnapshot:true,professionalCrefitoSnapshot:true,occurredAt:true,status:true,version:true,patient:{select:{status:true}}}});
  const changing=input.operation==='PREPARAR'||input.operation==='CONFERIR';
  if(changing && (s.status!=='VALIDO'||s.patient.status!=='ATIVO'))throw new AdministrativeConfigError("Paciente ou atendimento indisponível para produção.");
  if(current?.state==='APTO'&&changing)throw new AdministrativeConfigError("Devolva o item à preparação antes de alterar ou conferir novamente.");
  if(!current && !changing)throw new AdministrativeConfigError("Prepare o item primeiro.");
  const coverage=await tx.beneficiaryCoverage.findUnique({where:{id:input.coverageId},select:{patientId:true,contractId:true}});
  const procedure=await tx.billingProcedure.findUnique({where:{id:input.procedureId},select:{contractId:true}});
  if(!coverage||coverage.patientId!==s.patientId||procedure?.contractId!==coverage.contractId)throw new AdministrativeConfigError("Cobertura e procedimento devem pertencer ao paciente e ao mesmo contrato.");
  if(current && !changing && (current.coverageId!==input.coverageId||current.procedureId!==input.procedureId||current.quantity!==input.quantity||current.endTime!==input.endTime))throw new AdministrativeConfigError("Recarregue os dados atuais do item antes da operação.");
  if(current?.useId)await returnAuthorizationTx(tx,actorId,{useId:current.useId,requestId:randomUUID(),reason:input.reason});
  const day=toLocalDate(s.occurredAt);
  if(input.endTime && input.endTime<toLocalTime(s.occurredAt))throw new AdministrativeConfigError("Hora final anterior ao início; confirme o horário real.");
  let state='PENDENTE',pendingReason='Preparado: confira cobertura, autorização e tarifa.',useId:string|null=null;
  let snapshot:Prisma.InputJsonObject=current?.snapshot as Prisma.InputJsonObject??{},amountCents:bigint|null=current?.amountCents??null;
  if(input.operation==='INVALIDAR'){state='INVALIDADO';pendingReason=input.reason;}
  if(input.operation==='DEVOLVER')pendingReason='Devolvido à preparação: confira novamente.';
  if(input.operation==='CONFERIR'){
    const eligible=await readEligibilityTx(tx,{patientId:s.patientId,coverageId:input.coverageId,procedureId:input.procedureId,executionOn:day,quantity:input.quantity,itemId:input.authorizationItemId});
    const tariff=await readTariffSnapshotTx(tx,coverage.contractId,input.procedureId,day);
    if((eligible.status==='APTA'||eligible.status==='DISPENSADA')&&tariff.status==='OK'){
      if(eligible.status==='APTA'){
        const use=await consumeAuthorizationTx(tx,actorId,{requestId:randomUUID(),sourceKey:`production:${input.id}:${input.expectedVersion+1}`,itemId:input.authorizationItemId!,quantity:input.quantity,executionOn:day,reason:input.reason});useId=use.id;
      }
      state='APTO';pendingReason='';amountCents=BigInt(input.quantity)*BigInt(tariff.snapshot.amountCents);
      snapshot={sessionId:s.id,sessionVersion:s.version,professionalId:s.professionalId,professionalName:s.professionalNameSnapshot,professionalCrefito:s.professionalCrefitoSnapshot,occurredAt:s.occurredAt.toISOString(),endTime:input.endTime,eligibility:eligible.snapshot,tariff:tariff.snapshot};
     }else{
      const messages:Record<string,string>={SALDO_INSUFICIENTE:'Autorização sem saldo suficiente. Revise quantidade ou autorização.',AUTORIZACAO_PENDENTE:'Selecione uma autorização recebida para este procedimento.',AUTORIZACAO_INCOMPATIVEL:'Selecione um item autorizado desta cobertura e procedimento.',AUTORIZACAO_CANCELADA:'Autorização ou item cancelado. Revise a autorização.',AUTORIZACAO_FORA_DA_VIGENCIA:'Autorização fora da vigência na execução.',COBERTURA_FORA_DA_VIGENCIA:'Cobertura fora da vigência na execução.',REGRA_PENDENTE:'Solicite ao administrador a regra de exigência ou dispensa.',INATIVO:'Há cadastro inativo. Revise cobertura, contrato e procedimento.'};
      pendingReason=[eligible.status==='APTA'||eligible.status==='DISPENSADA'?'':messages[eligible.status]??'Revise cobertura e autorização.',tariff.status==='OK'?'':'Tarifa indisponível na execução. Solicite revisão do catálogo ao administrador.'].filter(Boolean).join(' ');
    }
  }
  const data={coverageId:input.coverageId,procedureId:input.procedureId,quantity:input.quantity,endTime:input.endTime,state,pendingReason,sessionVersion:s.version,executionOn:new Date(day+'T00:00:00Z'),useId,snapshot,amountCents};
  if(current)await tx.productionItem.update({where:{id:input.id},data:{...data,version:{increment:1}}});
  else await tx.productionItem.create({data:{id:input.id,sessionId:input.sessionId,...data}});
  await recordProductionChange(tx,input.id,actorId,input.reason,input.requestId,fingerprint);
  return input.id;
 }); }catch(error){
  if(error instanceof AdministrativeConfigError)throw error;
  if(typeof error==='object'&&error&&'code'in error&&error.code==='P2002')throw new AdministrativeConfigError("Este procedimento já possui item de produção nesta sessão. Abra o item existente.");
  throw error;
 }
}

// Consumidores de guia/lote chamam na transação do fechamento; esta função obtém as
// travas paciente → configuração → sessão/item. Em lote, pré-travar pacientes em ordem.
// Não consome novamente nem substitui o snapshot já conferido.
export async function revalidateProductionTx(tx: Prisma.TransactionClient, itemId: string) {
 const origin=await tx.productionItem.findUnique({where:{id:itemId},select:{sessionId:true,session:{select:{patientId:true}}}});
 if(!origin)return {status:'REVISAO_NECESSARIA' as const};
 await tx.$queryRaw`SELECT id FROM "Patient" WHERE id=${origin.session.patientId} FOR UPDATE`;
 await lockBeneficiary(tx);
 await tx.$queryRaw`SELECT id FROM "TreatmentSession" WHERE id=${origin.sessionId} FOR UPDATE`;
 await tx.$queryRaw`SELECT id FROM "ProductionItem" WHERE id=${itemId} FOR UPDATE`;
 const item=await tx.productionItem.findUnique({where:{id:itemId},include:{session:{select:{status:true,version:true,patientId:true}}}});
 if(!item||item.state!=='APTO'||item.adjustmentPending||item.session.status!=='VALIDO'||item.sessionVersion!==item.session.version)return {status:'REVISAO_NECESSARIA' as const};
 const use=item.useId?await tx.authorizationUse.findUnique({where:{id:item.useId},select:{itemId:true}}):null;
 const eligible=await readEligibilityTx(tx,{patientId:item.session.patientId,coverageId:item.coverageId,procedureId:item.procedureId,executionOn:item.executionOn.toISOString().slice(0,10),quantity:item.quantity,itemId:use?.itemId},item.useId??undefined);
 if(eligible.status!=='APTA'&&eligible.status!=='DISPENSADA')return {status:eligible.status};
 if((eligible.status==='DISPENSADA')!==!item.useId)return {status:'REGRA_ALTERADA' as const};
 return {status:'OK' as const,item};
}
