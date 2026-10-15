/** @jest-environment node */
const authorize=jest.fn(); const db={$transaction:jest.fn()};
jest.mock("@/modules/auth/dal",()=>({requirePermission:(...a:unknown[])=>authorize(...a),assertPermission:(...a:unknown[])=>authorize(...a),AuthorizationError:class AuthorizationError extends Error{}}));
jest.mock("@/lib/db",()=>({get prisma(){return db;}}));
import { listProduction,getProductionSession,productionSessionSelect } from "../production-queries";
import { saveProductionAction } from "../production-actions";
import { AuthorizationError } from "@/modules/auth/dal";
beforeEach(()=>{jest.clearAllMocks();});
it("anônimo e usuário inativo não leem nem escrevem produção",async()=>{
 authorize.mockRejectedValue(new AuthorizationError('denied'));
 await expect(listProduction({})).rejects.toThrow('denied');await expect(getProductionSession('x')).rejects.toThrow('denied');
 expect(await saveProductionAction(undefined,new FormData())).toEqual({error:'Acesso negado.'});expect(db.$transaction).not.toHaveBeenCalled();
});
it("projeção administrativa não seleciona conteúdo clínico ou relações de prontuário",()=>{
 expect(Object.keys(productionSessionSelect).sort()).toEqual(['id','occurredAt','patient','patientId','professionalNameSnapshot','status','version'].sort());
});
