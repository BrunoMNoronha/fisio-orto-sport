import { administrativeReportCsv, csvText } from "../report-csv";
import type { AdministrativeReport } from "../report-read";
describe('CSV administrativo', () => {
  test.each(['=1+1', ' +SUM(A1)', '-cmd', '@formula', '\ttexto', '\rtexto', '\ntexto'])('neutraliza fórmulas %j', v => expect(csvText(v)).toBe('"\'' + v + '"'));
  test('acentos, delimitadores, aspas e quebra de linha', () => expect(csvText('João; "Sessão"\nSão Paulo')).toBe('"João; ""Sessão""\nSão Paulo"'));
  const report = { kind: 'producao', filters: { page: 1 }, items: [], totals: [], total: 0, limit: 10000, generatedAt: new Date('2026-01-01T00:00:00Z'), labels: {}, error: null } as unknown as AdministrativeReport;
  test('UTF-8 BOM, metadados e completude', () => { const csv = administrativeReportCsv(report); expect(csv.startsWith('\uFEFF')).toBe(true); expect(csv).toContain('0 de 0 itens'); expect(csv).toContain('Valor conferido (centavos)'); expect(csv.endsWith('\r\n')).toBe(true); });
  test('recusa parcial e erro de limite', () => { expect(() => administrativeReportCsv({ ...report, total: 21 })).toThrow('todos os itens'); expect(() => administrativeReportCsv({ ...report, error: 'Limite' })).toThrow('incompleto'); });
});
