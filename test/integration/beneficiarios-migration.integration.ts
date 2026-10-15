import { CONTRACT_DEFAULTS } from "@/modules/administrativo/contract-defaults";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readdirSync,readFileSync} from "node:fs";
import {describe,it} from "node:test";
import {Client} from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "@/generated/prisma/client";
import {saveAdministrativeConfig} from "@/modules/administrativo/service";
const base=process.env.INTEGRATION_DATABASE_URL,migration="20261014190000_administrativo_coberturas";
describe("migração de coberturas preserva legado (#98)",{skip:!base},()=>{
  it("adiciona o domínio sem alterar paciente, financeiro ou catálogo anterior",async()=>{
    const name=`benef_migration_${randomUUID().replaceAll("-","")}`,admin=new Client({connectionString:base});await admin.connect();
    let db:Client|undefined,prisma:PrismaClient|undefined;
    try{
      await admin.query(`CREATE DATABASE "${name}"`);
      const url=new URL(base!);url.pathname=`/${name}`;db=new Client({connectionString:url.toString()});await db.connect();
      for(const dir of readdirSync("prisma/migrations").filter(v=>v!=="migration_lock.toml").sort()){
        if(dir===migration)break;await db.query(readFileSync(`prisma/migrations/${dir}/migration.sql`,"utf8"));
      }
      await db.query(readFileSync("prisma/migrations/20261015120000_administrativo_parametros/migration.sql","utf8"));
      prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
      const actor=await prisma.user.create({data:{name:"ADMIN LEGADO",email:"adm98-migration@example.test",passwordHash:"x",role:"ADMIN"}});
      const patient=await prisma.patient.create({data:{fullName:"PACIENTE LEGADO SINTETICO",birthDate:new Date("1990-01-01"),phone:"11999999999",createdById:actor.id,updatedById:actor.id,
        healthInsuranceProvider:"TEXTO LIVRE LEGADO",healthInsuranceCard:"000123"}});
      await prisma.charge.create({data:{patientId:patient.id,description:"Cobrança fictícia legada",amountCents:12345,dueDate:new Date("2026-10-01"),idempotencyKey:randomUUID(),createdById:actor.id}});
      const operatorId=randomUUID(),contractId=randomUUID();
      const meta=()=>({id:randomUUID(),requestId:randomUUID(),expectedVersion:0,reason:"Teste de migração",active:true});
      await saveAdministrativeConfig(prisma,actor.id,{kind:"operator",values:{...meta(),id:operatorId,name:"OPERADORA LEGADA SINTETICA",registrationAns:null}});
      await saveAdministrativeConfig(prisma,actor.id,{kind:"contract",values:{...meta(),id:contractId,operatorId,name:"CONTRATO LEGADO",providerCode:"0001",cnes:null,tissVersion:null,manualReference:null,homologationChannel:null,...CONTRACT_DEFAULTS}});
      await saveAdministrativeConfig(prisma,actor.id,{kind:"procedure",values:{...meta(),contractId,tableCode:"00",code:"0001",name:"PROCEDIMENTO LEGADO"}});
      const snapshot=async()=>{
        const rows:unknown[]=[];for(const table of ["User","Patient","Charge","Payment","PaymentReversal","HealthOperator","OperatorContract","BillingProcedure","ProcedureTariff","BillingProfessional","AdministrativeConfigChange"]){
          rows.push((await db!.query(`SELECT * FROM "${table}" ORDER BY id`)).rows);
        }return rows;
      };
      const before=await snapshot();await db.query(readFileSync(`prisma/migrations/${migration}/migration.sql`,"utf8"));
      assert.deepEqual(await snapshot(),before);
      for(const table of ["BeneficiaryCoverage","BenefitAuthorization","AuthorizationItem","AuthorizationUse","BeneficiaryChange","ProcedureAuthorizationRule"]){
        assert.equal((await db.query(`SELECT count(*)::int n FROM "${table}"`)).rows[0].n,0);
      }
    }finally{await prisma?.$disconnect();await db?.end();await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.end();}
  });
});
