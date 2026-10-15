import { parseAdministrativeReportFilters, administrativeReportQuery } from "../report-validation";
describe('filtros administrativos', () => {
  test('vazio é explícito e datas civis inclusivas', () => { expect(parseAdministrativeReportFilters('producao', {}).filters).toEqual({ page: 1 }); expect(parseAdministrativeReportFilters('producao', { start: '2026-01-15', end: '2026-01-15' }).error).toBeNull(); });
  test.each([{ start: '2026-02-30' }, { start: '2026-02-01', end: '2026-01-01' }, { patientId: '12345678900' }, { operatorId: 'abc' }, { page: '0' }, { page: '1.2' }, { unknown: 'x' }, { state: 'PAGO' }, { start: ['2026-01-01'] }, { professionalId: 3 }])('rejeita sem ampliar filtro %j', raw => { expect(parseAdministrativeReportFilters('producao', raw).filters).toBeNull(); });
  test('duplicados e filtros incompatíveis', () => { expect(parseAdministrativeReportFilters('producao', new URLSearchParams('page=1&page=2')).filters).toBeNull(); expect(parseAdministrativeReportFilters('autorizacoes', { professionalId: 'abc' }).filters).toBeNull(); expect(parseAdministrativeReportFilters('producao', { authorizationId: '00000000-0000-4000-8000-000000000000' }).filters).toBeNull(); });
  test('exportação não herda página', () => { expect(administrativeReportQuery({ page: 8, start: '2026-01-15' })).toBe('start=2026-01-15'); });
});
