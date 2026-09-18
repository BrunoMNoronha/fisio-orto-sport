-- painTypes passa a ser não nulo: lista vazia representa "nenhum tipo de dor".
-- Backfill aditivo: NULL e '{}' têm o mesmo significado; nenhuma informação clínica muda.
UPDATE "Anamnesis" SET "painTypes" = '{}' WHERE "painTypes" IS NULL;

-- AlterTable
ALTER TABLE "Anamnesis" ALTER COLUMN "painTypes" SET DEFAULT ARRAY[]::"PainType"[];
ALTER TABLE "Anamnesis" ALTER COLUMN "painTypes" SET NOT NULL;
