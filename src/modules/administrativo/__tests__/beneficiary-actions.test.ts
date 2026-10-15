/** @jest-environment node */
import { randomUUID } from "node:crypto";
const session={role:"ADMIN" as string|null},save=jest.fn(),rule=jest.fn();
jest.mock("@/lib/db",()=>({prisma:{}}));
jest.mock("@/modules/auth/dal",()=>{
  const {can}=jest.requireActual("@/modules/auth/permissions");class AuthorizationError extends Error{}
  return {AuthorizationError,assertPermission:jest.fn(async(permission:string)=>{if(!can(session.role,permission))throw new AuthorizationError();return{id:"session-actor",role:session.role};})};
});
jest.mock("../beneficiary-service",()=>({saveBeneficiary:(...args:unknown[])=>save(...args),saveAuthorizationRule:(...args:unknown[])=>rule(...args)}));
jest.mock("next/cache",()=>({revalidatePath:jest.fn()}));
jest.mock("next/navigation",()=>({redirect:jest.fn((url:string)=>{throw new Error(`REDIRECT:${url}`);})}));
import { saveCoverage,saveAuthorization,saveAuthorizationItem,saveProcedureRule } from "../beneficiary-actions";
function form(values:Record<string,string>={}){
  const fd=new FormData();Object.entries({id:randomUUID(),requestId:randomUUID(),expectedVersion:"0",reason:"Cadastro",active:"true",
    patientId:"paciente",contractId:randomUUID(),beneficiaryName:"Beneficiário",cardNumber:"000123",planName:"",startsOn:"2026-01-01",endsOn:"",...values}).forEach(([k,v])=>fd.set(k,v));return fd;
}
beforeEach(()=>{jest.clearAllMocks();session.role="ADMIN";save.mockResolvedValue("saved");rule.mockResolvedValue("saved");});
it("nega sessão ausente antes de validar/gravar",async()=>{
  session.role=null;for(const action of [saveCoverage,saveAuthorization,saveAuthorizationItem,saveProcedureRule])expect(await action(undefined,form())).toEqual({error:"Acesso negado."});
  expect(save).not.toHaveBeenCalled();expect(rule).not.toHaveBeenCalled();
});
it.each(["ADMIN","RECEPCAO","FISIOTERAPEUTA"])("permite preparar cobertura a %s usando autoria da sessão",async(role)=>{
  session.role=role;await expect(saveCoverage(undefined,form({actorId:"forjado"}))).rejects.toThrow("REDIRECT:/administrativo/coberturas/saved");
  expect(save.mock.calls[0][1]).toBe("session-actor");expect(save.mock.calls[0][2].values.cardNumber).toBe("000123");
});
it.each(["RECEPCAO","FISIOTERAPEUTA"])("reserva configuração de regra ao ADMIN, nega %s",async(role)=>{
  session.role=role;expect(await saveProcedureRule(undefined,form())).toEqual({error:"Acesso negado."});expect(rule).not.toHaveBeenCalled();
});
it("valida autorização/item no servidor e não retorna detalhes internos de falhas",async()=>{
  expect((await saveAuthorization(undefined,form()))?.fieldErrors?.number).toBeDefined();
  expect((await saveAuthorizationItem(undefined,form()))?.fieldErrors?.authorizedQuantity).toBeDefined();
  expect(save).not.toHaveBeenCalled();
  const log=jest.spyOn(console,"error").mockImplementation(()=>{});save.mockRejectedValue(new Error("credencial privada"));
  expect((await saveCoverage(undefined,form()))?.error).toContain("Nenhuma alteração");
  expect(log).toHaveBeenCalledWith("[administrativo] falha no beneficiário:","Error");log.mockRestore();
});
