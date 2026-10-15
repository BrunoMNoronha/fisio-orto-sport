/** Shared labels only: safe to import from client filters. */
export const FINANCIAL_OPTION_LABELS={operatorId:'Operadora',contractId:'Contrato',batchId:'Lote',guideId:'Guia',patientId:'Paciente',procedureId:'Procedimento',professionalId:'Profissional'};
export type FinancialOptionKey=keyof typeof FINANCIAL_OPTION_LABELS;
export const FINANCIAL_OPTION_KEYS=Object.keys(FINANCIAL_OPTION_LABELS) as FinancialOptionKey[];
