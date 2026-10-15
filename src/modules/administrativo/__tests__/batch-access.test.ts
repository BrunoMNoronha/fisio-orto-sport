/** @jest-environment node */
const user={role:'RECEPCAO' as string|null,active:true};
jest.mock('@/modules/auth/dal',()=>{const {can}=jest.requireActual('@/modules/auth/permissions');class AuthorizationError extends Error{}const check=jest.fn(async(p:string)=>{if(!user.active||!user.role||!can(user.role,p))throw new AuthorizationError('negado');return {id:'actor',role:user.role};});return {AuthorizationError,assertPermission:check,requirePermission:check};});
const save=jest.fn();jest.mock('../batch-service',()=>({saveBatch:(...a:unknown[])=>save(...a)}));
const query=jest.fn();jest.mock('@/lib/db',()=>({prisma:{$transaction:(...a:unknown[])=>query(...a)}}));
jest.mock('next/navigation',()=>({redirect:jest.fn(()=>{throw new Error('redirect');})}));jest.mock('next/cache',()=>({revalidatePath:jest.fn()}));
import {saveBatchAction} from '../batch-actions';
import {listBatches,getBatchReport,getBatchComposition} from '../batch-queries';
import {batchSchema,batchPageFilter,batchParams} from '../batch-validation';
const uuid='00000000-0000-4000-8000-000000000001';
function form(operation='SALVAR'){const f=new FormData();for(const [k,v]of Object.entries({id:uuid,requestId:uuid,expectedVersion:'0',reason:'Teste',operation,contractId:uuid,tissVersion:'04.03.00'}))f.set(k,v);return f;}
beforeEach(()=>{jest.clearAllMocks();user.role='RECEPCAO';user.active=true;save.mockResolvedValue(uuid);});
test.each([null,'DESCONHECIDO'])('nega todas as portas antes de consultar (%s)',async role=>{user.role=role;expect(await saveBatchAction(undefined,form())).toHaveProperty('error');await expect(listBatches({})).rejects.toThrow();await expect(getBatchReport(uuid)).rejects.toThrow();await expect(getBatchComposition(uuid)).rejects.toThrow();expect(save).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();});
test('inativo não grava',async()=>{user.active=false;expect(await saveBatchAction(undefined,form())).toHaveProperty('error');expect(save).not.toHaveBeenCalled();});
test.each(['RECEPCAO','FISIOTERAPEUTA'])('%s não fecha, cancela ou envia',async role=>{user.role=role;for(const op of ['FECHAR','CANCELAR','ENVIAR','CORRIGIR_ENVIO'])expect(await saveBatchAction(undefined,form(op))).toHaveProperty('error','Acesso negado.');expect(save).not.toHaveBeenCalled();});
test.each(['RECEPCAO','FISIOTERAPEUTA','ADMIN'])('%s prepara com autoria autenticada',async role=>{user.role=role;await expect(saveBatchAction(undefined,form())).rejects.toThrow('redirect');expect(save.mock.calls[0][1]).toBe('actor');});
test('ADMIN chega ao serviço nas transições',async()=>{user.role='ADMIN';for(const op of ['FECHAR','CANCELAR','ENVIAR','CORRIGIR_ENVIO'])await expect(saveBatchAction(undefined,form(op))).rejects.toThrow('redirect');expect(save).toHaveBeenCalledTimes(4);});
test('campos repetidos, guias repetidas e autoria forjada recusados',async()=>{const f=form();f.append('contractId',uuid);expect(await saveBatchAction(undefined,f)).toHaveProperty('error');const g=form();g.append('guideIds',uuid);g.append('guideIds',uuid);expect(await saveBatchAction(undefined,g)).toHaveProperty('error');const h=form();h.set('actorId','forjado');expect(await saveBatchAction(undefined,h)).toHaveProperty('error');expect(save).not.toHaveBeenCalled();});
test.each(['0','-1','1.5','NaN','100001'])('página inválida %s não consulta',async page=>{expect(await listBatches({page})).toBeNull();expect(await getBatchReport(uuid,{page})).toHaveProperty('error');expect(query).not.toHaveBeenCalled();});
test('filtros desconhecidos, arrays e parâmetros duplicados recusados',async()=>{expect(await listBatches({patient:'nome'})).toBeNull();expect(await getBatchReport(uuid,{page:['1','2']})).toHaveProperty('error');expect(batchPageFilter.safeParse(batchParams(new URLSearchParams('page=1&page=2'))).success).toBe(false);expect(query).not.toHaveBeenCalled();});
test('data impossível e versão fracionária recusadas',()=>{const raw={...Object.fromEntries(form()),guideIds:[]};expect(batchSchema.safeParse({...raw,sentOn:'2026-02-30'}).success).toBe(false);expect(batchSchema.safeParse({...raw,expectedVersion:1.2}).success).toBe(false);});
