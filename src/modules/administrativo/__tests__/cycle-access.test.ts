/** @jest-environment node */
const identity={role:'ADMIN' as string|null,active:false};
jest.mock('@/modules/auth/dal',()=>{
  const {can}=jest.requireActual('@/modules/auth/permissions');
  class AuthorizationError extends Error{}
  const check=async(permission:string)=>{if(!identity.active||!can(identity.role,permission))throw new AuthorizationError('negado');return {id:'actor',role:identity.role};};
  return {AuthorizationError,assertPermission:check,requirePermission:check};
});
const databaseAccess=jest.fn(()=>{throw new Error('Banco não deve ser acessado');});
jest.mock('@/lib/db',()=>({prisma:new Proxy({},{get:()=>databaseAccess()})}));
jest.mock('next/navigation',()=>({redirect:()=>{throw new Error('redirect');}}));
jest.mock('next/cache',()=>({revalidatePath:jest.fn()}));
import {saveOperator,saveContract} from '../actions';
import {saveProcedure,saveTariff,saveProfessional} from '../catalog-actions';
import {saveCoverage,saveAuthorization,saveAuthorizationItem,saveProcedureRule} from '../beneficiary-actions';
import {saveProductionAction} from '../production-actions';
import {saveGuideAction,saveGuideProfileAction} from '../guide-actions';
import {saveBatchAction} from '../batch-actions';
import {saveSettlementAction} from '../settlement-actions';
import {generateBatchXmlAction,saveTissProfileAction} from '../tiss/actions';
import {getGuideEditor} from '../guide-queries';
import {getBatchReport} from '../batch-queries';
import {getFinancialReport} from '../financial-report-queries';
import {GET as csv} from '@/app/(app)/administrativo/relatorios/[kind]/csv/route';
import {GET as xml} from '@/app/api/administrativo/lotes/[id]/xml/[artifactId]/route';
import PrintReport from '@/app/impressao/administrativo/[kind]/page';

test.each([
  {role:null,active:true},{role:'INVALIDO',active:true},
  ...['ADMIN','RECEPCAO','FISIOTERAPEUTA'].map(role=>({role,active:false})),
])('todas as etapas recusam identidade indisponível antes de validar dados/banco: %j',async state=>{
  Object.assign(identity,state);databaseAccess.mockClear();
  const actions=[saveOperator,saveContract,saveProcedure,saveTariff,saveProfessional,saveCoverage,saveAuthorization,saveAuthorizationItem,saveProcedureRule,saveProductionAction,saveGuideAction,saveGuideProfileAction,saveBatchAction,saveSettlementAction,generateBatchXmlAction,saveTissProfileAction];
  for(const action of actions)expect(await action(undefined,new FormData())).toHaveProperty('error','Acesso negado.');
  await expect(getGuideEditor('inválido')).rejects.toThrow('negado');
  await expect(getBatchReport('inválido')).rejects.toThrow('negado');
  await expect(getFinancialReport('conciliacao',{axis:'inválido'})).rejects.toThrow('negado');
  for(const kind of ['producao','faturamento','conciliacao']){
    expect((await csv(new Request('http://localhost/test?axis=inválido'),{params:Promise.resolve({kind})})).status).toBe(403);
    await expect(PrintReport({params:Promise.resolve({kind}),searchParams:Promise.resolve({})})).rejects.toThrow('negado');
  }
  expect((await xml(new Request('http://localhost/test'),{params:Promise.resolve({id:'inválido',artifactId:'inválido'})})).status).toBe(403);
  expect(databaseAccess).not.toHaveBeenCalled();
});
