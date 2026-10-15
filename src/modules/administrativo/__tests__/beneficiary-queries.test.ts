/** @jest-environment node */
const authorize=jest.fn();
const db={$transaction:jest.fn(),operatorContract:{findUnique:jest.fn()},billingProcedure:{findUnique:jest.fn()},procedureAuthorizationRule:{findMany:jest.fn()}};
jest.mock("@/modules/auth/dal",()=>({requirePermission:(...args:unknown[])=>authorize(...args)}));
jest.mock("@/lib/db",()=>({get prisma(){return db;}}));
import {listBeneficiaryPatients,getBeneficiary,listBeneficiaryContracts,getCoverage,getAuthorization,getAuthorizationItem,listAuthorizationProcedures,getProcedureRules,checkEligibility} from "../beneficiary-queries";
beforeEach(()=>{jest.clearAllMocks();authorize.mockResolvedValue({id:"a"});});
it("autoriza antes de consultar ou simular saldo",async()=>{
  authorize.mockRejectedValue(new Error("denied"));
  const calls=[()=>listBeneficiaryPatients({}),()=>getBeneficiary("p"),()=>listBeneficiaryContracts({}),()=>getCoverage("c"),()=>getAuthorization("a"),()=>getAuthorizationItem("i"),
    ()=>listAuthorizationProcedures("c",{}),()=>getProcedureRules("p"),()=>checkEligibility({patientId:"p",coverageId:"c",procedureId:"p",executionOn:"2026-01-01",quantity:1})];
  for(const call of calls)await expect(call()).rejects.toThrow("denied");
  expect(db.$transaction).not.toHaveBeenCalled();expect(db.procedureAuthorizationRule.findMany).not.toHaveBeenCalled();
});
it("recusa filtros inválidos em vez de consultar sem restrição",async()=>{
  expect(await listBeneficiaryPatients({q:["a","b"]})).toBeNull();
  expect(await listBeneficiaryContracts({page:"0"})).toBeNull();
  expect(await listAuthorizationProcedures("c",{page:"0"})).toBeNull();expect(db.$transaction).not.toHaveBeenCalled();
});
it("lista só identidade administrativa, com busca sem acentos e paginação",async()=>{
  const tx={patient:{count:jest.fn().mockResolvedValue(41),findMany:jest.fn().mockResolvedValue([])}};
  db.$transaction.mockImplementation(async read=>read(tx));
  expect(await listBeneficiaryPatients({q:"João",page:"999"})).toMatchObject({page:3,pages:3});
  expect(tx.patient.findMany.mock.calls[0][0]).toMatchObject({where:{searchName:{contains:"joao"}},take:20,skip:40,select:{id:true,fullName:true,status:true}});
});
