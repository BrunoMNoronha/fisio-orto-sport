-- MEL-03 (#46): snapshot de CREFITO na assinatura da anamnese. Aditiva e sem backfill (decisão de
-- 27/09/2026): as versões existentes ficam com authorCrefitoRecorded = false e CREFITO nulo, e a tela
-- mostra "CREFITO não registrado nesta versão". Não se copia o CREFITO atual do cadastro.

-- AlterTable: a coluna nasce com DEFAULT false para marcar as linhas existentes como legado; depois o
-- padrão passa a true, que vale para as versões novas (a aplicação também grava true explicitamente).
ALTER TABLE "Anamnesis" ADD COLUMN     "authorCrefitoRecorded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "authorCrefitoSnapshot" VARCHAR(20);

ALTER TABLE "Anamnesis" ALTER COLUMN "authorCrefitoRecorded" SET DEFAULT true;

-- Regra acrescentada manualmente (o Prisma não modela CHECKs): versão legada nunca tem CREFITO.
ALTER TABLE "Anamnesis"
  ADD CONSTRAINT "Anamnesis_legacy_without_crefito" CHECK ("authorCrefitoRecorded" OR "authorCrefitoSnapshot" IS NULL);
