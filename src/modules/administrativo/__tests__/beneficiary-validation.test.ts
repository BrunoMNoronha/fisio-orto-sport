import { randomUUID } from "node:crypto";
import { coverageSchema,authorizationSchema,authorizationItemSchema,authorizationRuleSchema } from "../beneficiary-validation";
const meta=()=>({id:randomUUID(),requestId:randomUUID(),expectedVersion:0,reason:"Registro",active:"true"});
const coverage=()=>({...meta(),patientId:"cuid",contractId:randomUUID(),beneficiaryName:"Fulano",cardNumber:"000123",planName:"",startsOn:"2026-01-01",endsOn:""});
it("preserva carteira textual e permite cobertura aberta sem inferir do paciente",()=>{
  const result=coverageSchema.parse(coverage()); expect(result.cardNumber).toBe("000123");expect(result.endsOn).toBeNull();expect(result.planName).toBeNull();
});
it.each(["2026-02-30","2026-1-01","1999-12-31"])("recusa data inválida %s",startsOn=>expect(coverageSchema.safeParse({...coverage(),startsOn}).success).toBe(false));
it("fim inclusivo pode ser igual ao início, mas não anterior",()=>{
  expect(coverageSchema.safeParse({...coverage(),endsOn:"2026-01-01"}).success).toBe(true);
  expect(coverageSchema.safeParse({...coverage(),endsOn:"2025-12-31"}).success).toBe(false);
});
it("autorização exige número, período completo e separa senha de número de guia",()=>{
  const raw={...meta(),coverageId:randomUUID(),contractId:randomUUID(),number:"000AUTH",accessCode:"000SENHA",issuedOn:"2026-02-01",startsOn:"2026-01-01",endsOn:"2026-01-31"};
  const parsed=authorizationSchema.parse(raw); expect(parsed.accessCode).toBe("000SENHA");
  // Emissão posterior não altera a regra pela execução; não presumir cronologia de recebimento.
  expect(authorizationSchema.safeParse({...raw,number:""}).success).toBe(false);
});
it.each(["0","-1","1.5","2147483648",""])("recusa quantidade não inteira/positiva %s",authorizedQuantity=>{
  expect(authorizationItemSchema.safeParse({...meta(),authorizationId:randomUUID(),contractId:randomUUID(),procedureId:randomUUID(),authorizedQuantity}).success).toBe(false);
});
it("dispensa exige referência expressa e não é preenchida por padrão",()=>{
  const raw={...meta(),procedureId:randomUUID(),reference:""};
  expect(authorizationRuleSchema.safeParse({...raw,mode:"DISPENSADA"}).success).toBe(false);
  expect(authorizationRuleSchema.safeParse({...raw,reference:"Manual"}).success).toBe(false);
});
