import type {Prisma} from '@/generated/prisma/client';

const models=new Set(['beneficiaryCoverage','patient','operatorContract','billingProcedure','procedureAuthorizationRule','authorizationItem','authorizationUse','billingProfessional','clinicSettings','guideProfile','benefitAuthorization']);
const methods=new Set(['findUnique','findUniqueOrThrow','findFirst','aggregate']);
/** Only for the read-only revalidation phase after patient/config/session/item locks.
 * Scope is one callback; no cache survives into writes, another transaction, or request.
 * Raw lock statements and mutable production/guide reads always reach PostgreSQL.
 */
export async function withLockedReadCache<T>(tx:Prisma.TransactionClient,read:(cached:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
  const cache=new Map<string,Promise<unknown>>(),delegates=new Map<string,unknown>();
  const cached=new Proxy(tx,{get(target,key,receiver){
    const delegate=Reflect.get(target,key,receiver);
    if(typeof key!=='string'||!models.has(key))return typeof delegate==='function'?delegate.bind(target):delegate;
    if(!delegates.has(key))delegates.set(key,new Proxy(delegate,{get(model,method){
      const fn=Reflect.get(model,method);
      if(typeof fn!=='function')return fn;
      if(typeof method==='string'&&/^(create|update|delete|upsert)/.test(method))return ()=>{throw new Error('A fase de revalidação com cache permite somente leitura.');};
      if(typeof method!=='string'||!methods.has(method))return fn.bind(model);
      return (args:unknown)=>{
        const id=key+':'+method+':'+JSON.stringify(args);
        if(cache.has(id))return cache.get(id);
        const result=Promise.resolve(fn.call(model,args));if(cache.size<10000)cache.set(id,result);return result;
      };
    }}));
    return delegates.get(key);
  }});
  try{return await read(cached);}finally{cache.clear();delegates.clear();}
}
