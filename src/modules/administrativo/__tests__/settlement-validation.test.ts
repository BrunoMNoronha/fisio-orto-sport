import {parseSettlementMoney,settlementSchema} from '../settlement-validation';
const uuid='00000000-0000-4000-8000-000000000001';
const entry=()=>({id:uuid,requestId:uuid,contractId:uuid,kind:'RECEBER',effectiveOn:'2026-10-15',reference:'SINT',reason:'Teste',amount:'100,00',lines:[{receivableId:uuid,amount:'100,00'}]});
test('valores exatos inclusive acima do limite seguro de number',()=>{
  expect(parseSettlementMoney('90071992547409,93')).toBe(BigInt('9007199254740993'));
  expect(parseSettlementMoney('92233720368547758,07')).toBe(BigInt('9223372036854775807'));
  expect(parseSettlementMoney('-0,01')).toBe(BigInt(-1));
});
test.each(['0','0,00','1.234,56','1e3','Infinity','NaN','0,001','92233720368547758,08','--1','1,','  '])('recusa valor inválido %s',value=>expect(parseSettlementMoney(value)).toBeNull());
test('alocação é integral, única por item/origem e positiva',()=>{
  expect(settlementSchema.safeParse(entry()).success).toBe(true);
  expect(settlementSchema.safeParse({...entry(),amount:'101,00'}).success).toBe(false);
  expect(settlementSchema.safeParse({...entry(),amount:'200,00',lines:[...entry().lines,...entry().lines]}).success).toBe(false);
  expect(settlementSchema.safeParse({...entry(),amount:'-100,00',lines:[{receivableId:uuid,amount:'-100,00'}]}).success).toBe(false);
});
test('glosa exige código e revisões exigem glosa original; ajuste admite redução explícita',()=>{
  expect(settlementSchema.safeParse({...entry(),kind:'GLOSAR'}).success).toBe(false);
  expect(settlementSchema.safeParse({...entry(),kind:'DEFINIR'}).success).toBe(false);
  expect(settlementSchema.safeParse({...entry(),kind:'DEFINIR',reason:''}).success).toBe(false);
  expect(settlementSchema.safeParse({...entry(),kind:'AJUSTAR',amount:'-100,00',lines:[{receivableId:uuid,amount:'-100,00'}]}).success).toBe(true);
});
test('datas impossíveis, autoria forjada e operações de estorno inconsistentes recusadas',()=>{
  expect(settlementSchema.safeParse({...entry(),effectiveOn:'2026-02-30'}).success).toBe(false);
  expect(settlementSchema.safeParse({...entry(),actorId:'forjado'}).success).toBe(false);
  expect(settlementSchema.safeParse({...entry(),kind:'ESTORNAR',reversesId:uuid}).success).toBe(false);
  expect(settlementSchema.safeParse({...entry(),kind:'ESTORNAR',reversesId:uuid,lines:[]}).success).toBe(true);
});
