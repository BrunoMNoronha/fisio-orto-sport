import { CONTRACT_DEFAULTS } from "@/modules/administrativo/contract-defaults";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { saveAdministrativeConfig } from "@/modules/administrativo/service";
import { saveBeneficiary, saveAuthorizationRule } from "@/modules/administrativo/beneficiary-service";
import { coverageSchema, authorizationSchema, authorizationItemSchema, authorizationRuleSchema } from "@/modules/administrativo/beneficiary-validation";
export const beneficiaryMeta = () => ({ id: randomUUID(), requestId: randomUUID(), expectedVersion: 0, reason: "Teste fictício", active: "true" });
export async function seedBeneficiary(db: PrismaClient, actorId: string, existing?: { patientId: string; contractId: string; procedureId: string }, procedureIdentity?:{tableCode:string;code:string}) {
  let patientId: string, contractId: string, procedureId: string;
  if (existing) ({patientId,contractId,procedureId}=existing);
  else {
    patientId=(await db.patient.create({ data:{ fullName:"PACIENTE SINTETICO ADM02",birthDate:new Date("1990-01-01"),phone:"11999999999",createdById:actorId,updatedById:actorId,
      healthInsuranceProvider:"LEGADO NÃO ESTRUTURADO",healthInsuranceCard:"000LEGADO" } })).id;
    const operatorId=randomUUID(); contractId=randomUUID(); procedureId=randomUUID();
    await saveAdministrativeConfig(db,actorId,{kind:"operator",values:{...beneficiaryMeta(),id:operatorId,active:true,name:"OPERADORA SINTETICA ADM02",registrationAns:null}});
    await saveAdministrativeConfig(db,actorId,{kind:"contract",values:{...beneficiaryMeta(),id:contractId,active:true,operatorId,name:"CONTRATO SINTETICO ADM02",
      providerCode:null,cnes:null,tissVersion:null,manualReference:null,homologationChannel:null,...CONTRACT_DEFAULTS}});
    await saveAdministrativeConfig(db,actorId,{kind:"procedure",values:{...beneficiaryMeta(),id:procedureId,active:true,contractId,tableCode:procedureIdentity?.tableCode??"00",code:procedureIdentity?.code??"00001",name:"PROCEDIMENTO SINTETICO ADM02"}});
  }
  const rule=authorizationRuleSchema.parse({...beneficiaryMeta(),procedureId,mode:"EXIGIDA",reference:"Manual sintético para teste"});
  await saveAuthorizationRule(db,actorId,rule);
  const coverage=coverageSchema.parse({...beneficiaryMeta(),patientId,contractId,beneficiaryName:"BENEFICIARIO SINTETICO",cardNumber:"000123",planName:"",
    startsOn:"2025-01-01",endsOn:"2027-12-31"});
  await saveBeneficiary(db,actorId,{kind:"coverage",values:coverage});
  const authorization=authorizationSchema.parse({...beneficiaryMeta(),coverageId:coverage.id,contractId,number:"000AUTH01",accessCode:"000SENHA",issuedOn:"2026-01-01",startsOn:"2026-01-01",endsOn:"2026-01-31"});
  await saveBeneficiary(db,actorId,{kind:"authorization",values:authorization});
  const item=authorizationItemSchema.parse({...beneficiaryMeta(),authorizationId:authorization.id,contractId,procedureId,authorizedQuantity:"10"});
  await saveBeneficiary(db,actorId,{kind:"item",values:item});
  return {patientId,contractId,procedureId,coverage,authorization,item,rule};
}
