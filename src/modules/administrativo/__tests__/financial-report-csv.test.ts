import {financialReportCsv} from '../financial-report-csv';
import type {FinancialReport,FinancialReportRow} from '../financial-report-read';
const amounts={batchValue:BigInt(10000),original:BigInt(10000),adjustment:BigInt(0),billed:BigInt(10000),received:BigInt(6000),open:BigInt(2000),analysis:BigInt(2000),writtenOff:BigInt(0),periodReceived:BigInt(3000),periodGlosed:BigInt(2000)};
const item:FinancialReportRow={...amounts,id:'item',operatorId:'operator',operator:'=1+1',contractId:'contract',contract:'CONTRATO SINTETICO',batchId:'batch',batchNumber:BigInt(1),guideId:'guide',guideNumber:BigInt(1),productionId:'production',patient:'BENEFICIARIO; "SINTETICO"\nTESTE',procedure:'+PROC',professional:'@FISIO',date:'2026-02-01',lastDate:'2026-02-28',state:'ENVIADO',itemCount:BigInt(1),guideCount:BigInt(1)};
const report:FinancialReport={kind:'conciliacao',filters:{axis:'recebimento',page:2},items:[item],totals:[{...amounts,operatorId:'operator',operator:'=1+1',contractId:'contract',contract:'CONTRATO SINTETICO',rowCount:BigInt(1),itemCount:BigInt(1)}],total:1,page:2,pages:2,limit:10000,generatedAt:new Date('2026-10-15T12:00:00Z'),labels:{},error:null};
test('CSV reutiliza proteção de células e preserva texto Unicode, aspas e quebras',()=>{
  const csv=financialReportCsv(report);expect(csv.startsWith('\uFEFF')).toBe(true);expect(csv).toContain('"\'=1+1"');expect(csv).toContain('"\'+PROC"');expect(csv).toContain('"\'@FISIO"');expect(csv).toContain('"BENEFICIARIO; ""SINTETICO""\nTESTE"');expect(csv.endsWith('\r\n')).toBe(true);
});
test('metadados declaram eixo, posição e completude; dinheiro permanece em centavos',()=>{
  const csv=financialReportCsv(report);expect(csv).toContain('Data efetiva de recebimento atualmente válido');expect(csv).toContain('posição atual');expect(csv).toContain('1 de 1 linhas');expect(csv).toContain(';10000;0;10000;6000;2000;2000;0;3000;');expect(csv).not.toContain('page:');
});
test('CSV recusa erro e página incompleta',()=>{
  expect(()=>financialReportCsv({...report,total:21})).toThrow('todo o filtro');expect(()=>financialReportCsv({...report,error:'Limite'})).toThrow('todo o filtro');
});
