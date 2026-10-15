import { randomUUID } from "node:crypto";
import { productionSchema } from "../production-validation";
const input=()=>({id:randomUUID(),requestId:randomUUID(),expectedVersion:0,reason:'Teste',sessionId:'session',coverageId:randomUUID(),procedureId:randomUUID(),quantity:'1',endTime:'',authorizationItemId:'',operation:'CONFERIR'});
it('quantidade não aceita vazio, fração, zero ou excedente',()=>{for(const quantity of ['', '0','1.5','2147483648'])expect(productionSchema.safeParse({...input(),quantity}).success).toBe(false);});
it('hora final ausente não é inferida; formato e operação são explícitos',()=>{expect(productionSchema.parse(input()).endTime).toBeNull();expect(productionSchema.safeParse({...input(),endTime:'25:00'}).success).toBe(false);expect(productionSchema.safeParse({...input(),operation:'FECHAR'}).success).toBe(false);});
