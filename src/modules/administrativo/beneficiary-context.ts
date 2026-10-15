import type { Prisma } from "@/generated/prisma/client";
// Uso interno após autorização. Leituras sequenciais na mesma conexão transacional:
// Prisma pode paralelizar ramos de include; o driver pg exige consultas serializadas.
export async function readCoverageContext(tx: Prisma.TransactionClient,id: string) {
  const coverage=await tx.beneficiaryCoverage.findUnique({where:{id}});
  if(!coverage)return null;
  const patient=await tx.patient.findUnique({where:{id:coverage.patientId},select:{id:true,fullName:true,status:true}});
  const contract=await tx.operatorContract.findUnique({where:{id:coverage.contractId},select:{id:true,name:true,active:true,operator:{select:{name:true,active:true}}}});
  if(!patient||!contract)return null;
  return {...coverage,patient,contract};
}
export async function readAuthorizationContext(tx: Prisma.TransactionClient,id:string) {
  const authorization=await tx.benefitAuthorization.findUnique({where:{id}});
  if(!authorization)return null;
  const coverage=await readCoverageContext(tx,authorization.coverageId);
  if(!coverage)return null;
  return {...authorization,coverage};
}
