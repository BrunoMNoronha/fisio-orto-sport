/** @jest-environment node */
const user={role:'RECEPCAO' as string|null,active:true};
jest.mock('@/modules/auth/dal',()=>{const {can}=jest.requireActual('@/modules/auth/permissions');class AuthorizationError extends Error{}const check=jest.fn(async(permission:string)=>{if(!user.active||!user.role||!can(user.role,permission))throw new AuthorizationError('negado');return {id:'actor-authenticated',role:user.role};});return {AuthorizationError,assertPermission:check,requirePermission:check};});
const save=jest.fn(),query=jest.fn();
jest.mock('../settlement-service',()=>({saveSettlement:(...args:unknown[])=>save(...args)}));
jest.mock('../settlement-read',()=>({readSettlementWorkspace:(...args:unknown[])=>query(...args)}));
jest.mock('@/lib/db',()=>({prisma:{operatorContract:{findMany:(...args:unknown[])=>query(...args)},operatorSettlement:{findUnique:(...args:unknown[])=>query(...args)}}}));
jest.mock('next/navigation',()=>({redirect:jest.fn(()=>{throw new Error('redirect');})}));
jest.mock('next/cache',()=>({revalidatePath:jest.fn()}));
import {saveSettlementAction} from '../settlement-actions';
import {getSettlementWorkspace,getSettlementRecord} from '../settlement-queries';
const uuid='00000000-0000-4000-8000-000000000001';
function form(){const result=new FormData();for(const [key,value] of Object.entries({id:uuid,requestId:uuid,contractId:uuid,kind:'RECEBER',effectiveOn:'2026-10-15',reference:'SINT',reason:'Teste',amount:'1,00',lines:JSON.stringify([{receivableId:uuid,amount:'1,00'}])}))result.set(key,value);return result;}
beforeEach(()=>{jest.clearAllMocks();user.role='RECEPCAO';user.active=true;save.mockResolvedValue(uuid);query.mockResolvedValue([]);});
test.each([null,'DESCONHECIDO'])('%s não consulta nem grava antes da autorização',async role=>{
  user.role=role;expect(await saveSettlementAction(undefined,form())).toHaveProperty('error');await expect(getSettlementWorkspace({})).rejects.toThrow();await expect(getSettlementRecord(uuid)).rejects.toThrow();expect(query).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
});
test.each(['RECEPCAO','FISIOTERAPEUTA'])('%s lê posição, mas não concilia',async role=>{
  user.role=role;expect(await saveSettlementAction(undefined,form())).toHaveProperty('error','Acesso negado.');expect(save).not.toHaveBeenCalled();expect(await getSettlementWorkspace({})).toHaveProperty('canManage',false);expect(query).toHaveBeenCalled();
});
test('ADMIN concilia com autor da sessão; inativo é bloqueado',async()=>{
  user.role='ADMIN';await expect(saveSettlementAction(undefined,form())).rejects.toThrow('redirect');expect(save.mock.calls[0][1]).toBe('actor-authenticated');jest.clearAllMocks();user.active=false;expect(await saveSettlementAction(undefined,form())).toHaveProperty('error','Acesso negado.');expect(save).not.toHaveBeenCalled();
});
test('autoria, deltas brutos, JSON inválido e campos repetidos não alcançam serviço',async()=>{
  user.role='ADMIN';for(const key of ['actorId','receivedDelta']){const f=form();f.set(key,'forjado');expect(await saveSettlementAction(undefined,f)).toHaveProperty('error');}
  const f=form();f.set('lines','{');expect(await saveSettlementAction(undefined,f)).toHaveProperty('error');const repeat=form();repeat.append('amount','1,00');expect(await saveSettlementAction(undefined,repeat)).toHaveProperty('error');expect(save).not.toHaveBeenCalled();
});
test('filtros/identificadores inválidos não consultam',async()=>{
  expect(await getSettlementWorkspace({page:'0'})).toHaveProperty('error');expect(await getSettlementWorkspace({page:['1','2']})).toHaveProperty('error');expect(await getSettlementRecord('forjado')).toBeNull();expect(query).not.toHaveBeenCalled();
});
