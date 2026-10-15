/** @jest-environment node */
const user={role:'RECEPCAO' as string|null,active:true};
jest.mock('@/modules/auth/dal',()=>{const {can}=jest.requireActual('@/modules/auth/permissions');class AuthorizationError extends Error{}const check=jest.fn(async(p:string)=>{if(!user.active||!user.role||!can(user.role,p))throw new AuthorizationError('negado');return {id:'actor',role:user.role};});return {AuthorizationError,assertPermission:check,requirePermission:check};});
const generate=jest.fn(),save=jest.fn(),query=jest.fn();
jest.mock('../tiss/xml-service',()=>({...jest.requireActual('../tiss/xml-service'),generateBatchXml:(...a:unknown[])=>generate(...a)}));
jest.mock('../tiss/profile-service',()=>({saveTissProfile:(...a:unknown[])=>save(...a)}));
jest.mock('@/lib/db',()=>({prisma:{$transaction:(...a:unknown[])=>query(...a),batchArtifact:{findFirst:(...a:unknown[])=>query(...a)},billingBatch:{findUnique:(...a:unknown[])=>query(...a)}}}));
jest.mock('next/navigation',()=>({redirect:jest.fn(()=>{throw new Error('redirect');})}));jest.mock('next/cache',()=>({revalidatePath:jest.fn()}));
import {generateBatchXmlAction,saveTissProfileAction} from '../tiss/actions';
import {downloadBatchXml,getTissProfile,getBatchXmlOptions} from '../tiss/queries';
import {GET} from '@/app/api/administrativo/lotes/[id]/xml/[artifactId]/route';
const uuid='00000000-0000-4000-8000-000000000001';
function form(){const f=new FormData();for(const [k,v]of Object.entries({batchId:uuid,requestId:uuid,expectedVersion:'2',reason:'Geração sintética'}))f.set(k,v);return f;}
beforeEach(()=>{jest.clearAllMocks();user.role='RECEPCAO';user.active=true;generate.mockResolvedValue(uuid);});
test.each([null,'DESCONHECIDO','RECEPCAO','FISIOTERAPEUTA'])('%s não gera, configura ou baixa antes do banco',async role=>{user.role=role;expect(await generateBatchXmlAction(undefined,form())).toHaveProperty('error','Acesso negado.');expect(await saveTissProfileAction(undefined,new FormData())).toHaveProperty('error');await expect(downloadBatchXml(uuid,uuid)).rejects.toThrow();await expect(getTissProfile(uuid)).rejects.toThrow();await expect(getBatchXmlOptions(uuid)).rejects.toThrow();const r=await GET(new Request('http://localhost/test'),{params:Promise.resolve({id:uuid,artifactId:uuid})});expect(r.status).toBe(403);expect(query).not.toHaveBeenCalled();expect(generate).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();});
test('inativo não gera',async()=>{user.role='ADMIN';user.active=false;expect(await generateBatchXmlAction(undefined,form())).toHaveProperty('error');expect(generate).not.toHaveBeenCalled();});
test('ADMIN gera com autor da sessão',async()=>{user.role='ADMIN';await expect(generateBatchXmlAction(undefined,form())).rejects.toThrow('redirect');expect(generate.mock.calls[0][1]).toBe('actor');});
test('autoria, versão, finalidade e dados brutos não são aceitos como campos extras',async()=>{user.role='ADMIN';for(const key of ['actorId','purpose','bytes','snapshot']){const f=form();f.set(key,'forjado');expect(await generateBatchXmlAction(undefined,f)).toHaveProperty('error');}const f=form();f.append('batchId',uuid);expect(await generateBatchXmlAction(undefined,f)).toHaveProperty('error');expect(generate).not.toHaveBeenCalled();});
test('IDs inválidos recusam consulta mesmo ADMIN',async()=>{user.role='ADMIN';expect(await downloadBatchXml('invalid',uuid)).toBeNull();expect(query).not.toHaveBeenCalled();});
