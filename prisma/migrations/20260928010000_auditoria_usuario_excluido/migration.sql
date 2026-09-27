-- #76: evento de auditoria da exclusão de usuário desativado. Aditiva: só acrescenta um valor ao enum;
-- eventos existentes e a retenção/imutabilidade da auditoria não mudam.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'USUARIO_EXCLUIDO';
