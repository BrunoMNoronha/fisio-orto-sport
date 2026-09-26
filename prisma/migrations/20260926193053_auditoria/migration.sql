-- Trilha de auditoria de login e gestão de usuários (issue #56).
-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'ACESSO_NEGADO', 'PRIMEIRO_ADMIN_CRIADO', 'USUARIO_CRIADO', 'USUARIO_EDITADO', 'PERFIL_ALTERADO', 'USUARIO_ATIVADO', 'USUARIO_DESATIVADO', 'SENHA_REDEFINIDA', 'CLI_ADMIN_CRIADO', 'CLI_SENHA_REDEFINIDA');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCESSO', 'FALHA', 'BLOQUEADO', 'NEGADO');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "result" "AuditResult" NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "targetUserId" TEXT,
    "emailHash" CHAR(64),
    "ip" VARCHAR(45),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetUserId_createdAt_idx" ON "AuditLog"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- Imutabilidade (decisão A7): a aplicação só insere. UPDATE e TRUNCATE são sempre recusados;
-- DELETE só é aceito para registros com mais de 7 dias (retenção A5, mesmo valor de
-- AUDIT_RETENTION_DAYS em src/modules/auditoria/events.ts), que é o expurgo.
CREATE FUNCTION "AuditLog_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."createdAt" < now() - interval '7 days' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'AuditLog: registro de auditoria com menos de 7 dias não pode ser excluído';
  END IF;
  RAISE EXCEPTION 'AuditLog: registros de auditoria são imutáveis (%)', TG_OP;
END;
$$;

CREATE TRIGGER "AuditLog_immutable_row"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "AuditLog_guard"();

CREATE TRIGGER "AuditLog_no_truncate"
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION "AuditLog_guard"();
