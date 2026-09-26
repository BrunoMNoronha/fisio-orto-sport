-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "searchName" TEXT NOT NULL DEFAULT '';

-- Busca de pacientes sem diferenciar acentos (acrescentado manualmente; o Prisma não modela triggers).
-- Remove os acentos com translate (sem depender da extensão unaccent) e passa para minúsculas.
-- Deve produzir o mesmo que normalizeSearch() em src/modules/pacientes/validation.ts.
CREATE FUNCTION patient_search_name(value TEXT) RETURNS TEXT
  LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
  AS $$
    SELECT lower(translate(
      value,
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñÝýÿ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'
    ))
  $$;

CREATE FUNCTION patient_set_search_name() RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
  BEGIN
    NEW."searchName" := patient_search_name(NEW."fullName");
    RETURN NEW;
  END;
  $$;

-- Toda gravação do nome (aplicação, seed, scripts) atualiza a coluna de busca.
CREATE TRIGGER "Patient_search_name"
  BEFORE INSERT OR UPDATE OF "fullName", "searchName" ON "Patient"
  FOR EACH ROW EXECUTE FUNCTION patient_set_search_name();

-- Preenche os cadastros existentes.
UPDATE "Patient" SET "searchName" = patient_search_name("fullName");
