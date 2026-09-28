-- #78: evento de auditoria da limpeza da base pela aba Desenvolvimento. Aditiva: só acrescenta um valor
-- ao enum; eventos existentes e a retenção/imutabilidade da auditoria não mudam.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'BASE_REINICIADA';
