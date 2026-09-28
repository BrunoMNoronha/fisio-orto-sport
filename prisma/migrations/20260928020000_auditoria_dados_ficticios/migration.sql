-- #73: evento de auditoria da geração de dados fictícios em desenvolvimento. Aditiva: só acrescenta um
-- valor ao enum; eventos existentes e a retenção/imutabilidade da auditoria não mudam.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DADOS_FICTICIOS_GERADOS';
