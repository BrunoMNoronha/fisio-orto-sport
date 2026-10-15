import {parseFinancialReportFilters,financialReportQuery,financialReportCriterion} from '../financial-report-validation';
const uuid='00000000-0000-4000-8000-000000000001';
test('defaults separam envio do lote e execução do item',()=>{
  expect(parseFinancialReportFilters('faturamento',{}).filters).toEqual({axis:'envio',page:1});
  expect(parseFinancialReportFilters('conciliacao',undefined).filters).toEqual({axis:'execucao',page:1});
});
test.each([{start:'2026-02-30'},{start:'2026-03-01',end:'2026-02-01'},{page:'0'},{axis:'createdAt'},{patientId:'12345678901'},{contractId:'forjado'},{page:['1','2']},{patient:'dados'},{state:'CANCELADO'}])('filtro inválido é explícito %j',raw=>expect(parseFinancialReportFilters('conciliacao',raw).filters).toBeNull());
test('duplicados e tipos não textuais recusados',()=>{
  expect(parseFinancialReportFilters('conciliacao',new URLSearchParams('axis=envio&axis=glosa')).filters).toBeNull();
  expect(parseFinancialReportFilters('conciliacao',{page:1}).filters).toBeNull();
  expect(parseFinancialReportFilters('desconhecido',{}).filters).toBeNull();
});
test('lotes não aceitam filtros parciais ou eixos de itens',()=>{
  for(const raw of [{guideId:uuid},{patientId:'paciente'},{procedureId:uuid},{professionalId:'fisio'},{balance:'COM_ABERTO'},{axis:'recebimento'}])expect(parseFinancialReportFilters('faturamento',raw).filters).toBeNull();
  expect(parseFinancialReportFilters('conciliacao',{state:'ENVIADO'}).filters).toBeNull();
});
test('query preserva eixos e filtros, remove página para saída integral',()=>{
  const f=parseFinancialReportFilters('conciliacao',{contractId:uuid,axis:'recebimento',start:'2026-02-01',end:'2026-02-28',balance:'COM_RECEBIDO',page:'2'}).filters!;
  const exported=new URLSearchParams(financialReportQuery(f));expect(exported.has('page')).toBe(false);expect(exported.get('axis')).toBe('recebimento');expect(exported.get('balance')).toBe('COM_RECEBIDO');expect(new URLSearchParams(financialReportQuery(f,3)).get('page')).toBe('3');
});
test('critério esclarece coorte, estado atual, primeira obrigação e ausência de contabilidade',()=>{
  expect(financialReportCriterion('conciliacao','recebimento')).toMatch(/atualmente válida/);
  expect(financialReportCriterion('conciliacao','glosa')).toMatch(/inclusive glosas já liberadas/);
  expect(financialReportCriterion('faturamento','fechamento')).toMatch(/preparado/);
  expect(financialReportCriterion('conciliacao','envio')).toMatch(/não são posição histórica/);
});
