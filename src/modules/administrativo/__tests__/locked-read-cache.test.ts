/** @jest-environment node */
import type {Prisma} from '@/generated/prisma/client';
import {withLockedReadCache} from '../locked-read-cache';
test('revalidação reutiliza somente leitura idêntica; nova fase e escrita fora da fase veem dados novos',async()=>{
  let version=1;
  const findUnique=jest.fn(async(args:{where:{id:string}})=>({id:args.where.id,version}));
  const update=jest.fn(async()=>{version++;});const raw=jest.fn(async()=>[]);
  const tx={operatorContract:{findUnique,update},$queryRaw:raw} as unknown as Prisma.TransactionClient;
  await withLockedReadCache(tx,async c=>{
    expect(await c.operatorContract.findUnique({where:{id:'a'}})).toHaveProperty('version',1);
    expect(await c.operatorContract.findUnique({where:{id:'a'}})).toHaveProperty('version',1);
    await c.operatorContract.findUnique({where:{id:'b'}});
    await c.$queryRaw`SELECT 1 FOR UPDATE`;await c.$queryRaw`SELECT 1 FOR UPDATE`;
    expect(()=>c.operatorContract.update({where:{id:'a'},data:{}})).toThrow('somente leitura');
  });
  expect(findUnique).toHaveBeenCalledTimes(2);expect(raw).toHaveBeenCalledTimes(2);
  await tx.operatorContract.update({where:{id:'a'},data:{}});
  await withLockedReadCache(tx,async c=>{expect(await c.operatorContract.findUnique({where:{id:'a'}})).toHaveProperty('version',2);});
  expect(findUnique).toHaveBeenCalledTimes(3);
});
test('exceção não reaproveita cache na próxima transação nem cacheia produção mutável',async()=>{
  const query=jest.fn(async()=>({version:1}));
  const tx={patient:{findUnique:query},productionItem:{findUnique:query}} as unknown as Prisma.TransactionClient;
  await expect(withLockedReadCache(tx,async c=>{await c.patient.findUnique({where:{id:'a'}});throw new Error('rollback');})).rejects.toThrow('rollback');
  await withLockedReadCache(tx,async c=>{await c.patient.findUnique({where:{id:'a'}});await c.productionItem.findUnique({where:{id:'p'}});await c.productionItem.findUnique({where:{id:'p'}});});
  expect(query).toHaveBeenCalledTimes(4);
});
