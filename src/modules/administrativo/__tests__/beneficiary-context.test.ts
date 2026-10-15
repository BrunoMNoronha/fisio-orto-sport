/** @jest-environment node */
import type { Prisma } from "@/generated/prisma/client";
import { readCoverageContext } from "../beneficiary-context";
it("serializa as consultas da cobertura na conexão transacional, sem ramos simultâneos",async()=>{
  let busy=false;
  const read=async<T,>(value:T)=>{
    if(busy)throw new Error("Consulta simultânea no mesmo cliente pg");
    busy=true;await Promise.resolve();busy=false;return value;
  };
  const tx={beneficiaryCoverage:{findUnique:()=>read({id:"c",patientId:"p",contractId:"ct",cardNumber:"000123"})},
    patient:{findUnique:()=>read({id:"p",fullName:"BENEFICIARIO",status:"ATIVO"})},
    operatorContract:{findUnique:()=>read({id:"ct",name:"CONTRATO",active:true,operator:{name:"OPERADORA",active:true}})}};
  expect(await readCoverageContext(tx as unknown as Prisma.TransactionClient,"c")).toMatchObject({cardNumber:"000123",patient:{fullName:"BENEFICIARIO"},contract:{name:"CONTRATO"}});
});
