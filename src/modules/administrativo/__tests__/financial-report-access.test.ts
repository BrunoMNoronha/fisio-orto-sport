/** @jest-environment node */
const user={role:'RECEPCAO' as string|null,active:true};
jest.mock('@/modules/auth/dal',()=>{const {can}=jest.requireActual('@/modules/auth/permissions');class AuthorizationError extends Error{}const check=jest.fn(async(permission:string)=>{if(!user.active||!user.role||!can(user.role,permission))throw new AuthorizationError('negado');});return {AuthorizationError,requirePermission:check,assertPermission:check};});
const read=jest.fn(),query=jest.fn();
jest.mock('../financial-report-read',()=>({...jest.requireActual('../financial-report-read'),readFinancialReport:(...args:unknown[])=>read(...args)}));
jest.mock('@/lib/db',()=>({prisma:{$queryRaw:(...args:unknown[])=>query(...args)}}));
import {getFinancialReport} from '../financial-report-queries';
import {searchFinancialReportOptions} from '../financial-report-actions';
import {GET} from '@/app/(app)/administrativo/relatorios/[kind]/csv/route';
import PrintPage from '@/app/impressao/administrativo/[kind]/page';
const context={params:Promise.resolve({kind:'conciliacao'})};
const request=(q='')=>new Request('http://localhost/administrativo/relatorios/conciliacao/csv'+q);
beforeEach(()=>{jest.clearAllMocks();user.role='RECEPCAO';user.active=true;read.mockResolvedValue({kind:'conciliacao',filters:{axis:'execucao',page:1},items:[],totals:[],total:0,page:1,pages:1,limit:10000,generatedAt:new Date('2026-01-01'),labels:{},error:null});query.mockResolvedValue([]);});
test.each(['ADMIN','RECEPCAO','FISIOTERAPEUTA'])('%s lê relatório, CSV, impressão e seletores',async role=>{
  user.role=role;expect((await getFinancialReport('conciliacao',{})).error).toBeNull();expect((await GET(request(),context)).status).toBe(200);await expect(PrintPage({...context,searchParams:Promise.resolve({})})).resolves.toBeTruthy();expect(read.mock.calls.at(-1)?.[3]).toBe('all');expect(await searchFinancialReportOptions('batchId','1')).toEqual({items:[],hasMore:false});
});
test.each([{role:null,active:true},{role:'ADMIN',active:false},{role:'INVALIDO',active:true}])('nega antes de consultar ou validar %j',async state=>{
  Object.assign(user,state);await expect(getFinancialReport('conciliacao',{axis:'forjado'})).rejects.toThrow();expect((await GET(request('?axis=forjado'),context)).status).toBe(403);await expect(PrintPage({...context,searchParams:Promise.resolve({})})).rejects.toThrow();expect(await searchFinancialReportOptions('guideId','')).toHaveProperty('error');expect(read).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
});
test('filtro inválido não consulta, limite recusa saída e todas as respostas são privadas',async()=>{
  let response=await GET(request('?start=2026-02-30'),context);expect(response.status).toBe(400);expect(read).not.toHaveBeenCalled();response=await GET(request(),context);expect(response.headers.get('cache-control')).toContain('private, no-store');expect(response.headers.get('content-disposition')).toBe('attachment; filename="administrativo-conciliacao.csv"');expect(response.headers.get('x-content-type-options')).toBe('nosniff');read.mockResolvedValue({error:'Limite excedido'});response=await GET(request(),context);expect(response.status).toBe(422);expect(response.headers.get('cache-control')).toContain('no-store');
});
test('busca recusa seletor forjado e período/duplicatas inválidos não atingem o leitor',async()=>{
  expect(await searchFinancialReportOptions('snapshot' as never,'')).toHaveProperty('error');expect(await searchFinancialReportOptions('patientId','x'.repeat(121))).toHaveProperty('error');expect((await GET(request('?axis=envio&axis=glosa'),context)).status).toBe(400);expect(query).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
});
