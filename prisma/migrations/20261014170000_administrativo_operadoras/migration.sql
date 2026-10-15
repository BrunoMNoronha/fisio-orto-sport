-- CreateTable
CREATE TABLE "HealthOperator" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "registrationAns" VARCHAR(6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "HealthOperator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorContract" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "providerCode" VARCHAR(30),
    "cnes" VARCHAR(7),
    "tissVersion" VARCHAR(8),
    "manualReference" VARCHAR(300),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "OperatorContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdministrativeConfigChange" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT,
    "contractId" TEXT,
    "procedureId" TEXT,
    "tariffId" TEXT,
    "professionalId" TEXT,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "requestId" VARCHAR(36) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdministrativeConfigChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingProcedure" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "tableCode" VARCHAR(10) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "BillingProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcedureTariff" (
    "id" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "ProcedureTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingProfessional" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" VARCHAR(120) NOT NULL,
    "purpose" VARCHAR(12) NOT NULL,
    "councilCode" VARCHAR(2),
    "councilNumber" VARCHAR(20),
    "councilState" VARCHAR(2),
    "occupationCode" VARCHAR(6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "BillingProfessional_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthOperator_registrationAns_key" ON "HealthOperator"("registrationAns");

-- CreateIndex
CREATE INDEX "HealthOperator_name_id_idx" ON "HealthOperator"("name", "id");

-- CreateIndex
CREATE INDEX "OperatorContract_operatorId_active_name_id_idx" ON "OperatorContract"("operatorId", "active", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorContract_operatorId_name_key" ON "OperatorContract"("operatorId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AdministrativeConfigChange_requestId_key" ON "AdministrativeConfigChange"("requestId");

-- CreateIndex
CREATE INDEX "AdministrativeConfigChange_actorId_idx" ON "AdministrativeConfigChange"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "AdministrativeConfigChange_operatorId_version_key" ON "AdministrativeConfigChange"("operatorId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AdministrativeConfigChange_contractId_version_key" ON "AdministrativeConfigChange"("contractId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AdministrativeConfigChange_procedureId_version_key" ON "AdministrativeConfigChange"("procedureId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AdministrativeConfigChange_tariffId_version_key" ON "AdministrativeConfigChange"("tariffId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AdministrativeConfigChange_professionalId_version_key" ON "AdministrativeConfigChange"("professionalId", "version");

-- CreateIndex
CREATE INDEX "BillingProcedure_contractId_name_id_idx" ON "BillingProcedure"("contractId", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BillingProcedure_contractId_tableCode_code_key" ON "BillingProcedure"("contractId", "tableCode", "code");

-- CreateIndex
CREATE INDEX "ProcedureTariff_procedureId_startsOn_id_idx" ON "ProcedureTariff"("procedureId", "startsOn", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BillingProfessional_userId_key" ON "BillingProfessional"("userId");

-- CreateIndex
CREATE INDEX "BillingProfessional_name_id_idx" ON "BillingProfessional"("name", "id");

-- AddForeignKey
ALTER TABLE "HealthOperator" ADD CONSTRAINT "HealthOperator_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthOperator" ADD CONSTRAINT "HealthOperator_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorContract" ADD CONSTRAINT "OperatorContract_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "HealthOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorContract" ADD CONSTRAINT "OperatorContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorContract" ADD CONSTRAINT "OperatorContract_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrativeConfigChange" ADD CONSTRAINT "AdministrativeConfigChange_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "HealthOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrativeConfigChange" ADD CONSTRAINT "AdministrativeConfigChange_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OperatorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrativeConfigChange" ADD CONSTRAINT "AdministrativeConfigChange_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "BillingProcedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrativeConfigChange" ADD CONSTRAINT "AdministrativeConfigChange_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "ProcedureTariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrativeConfigChange" ADD CONSTRAINT "AdministrativeConfigChange_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "BillingProfessional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrativeConfigChange" ADD CONSTRAINT "AdministrativeConfigChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProcedure" ADD CONSTRAINT "BillingProcedure_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OperatorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProcedure" ADD CONSTRAINT "BillingProcedure_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProcedure" ADD CONSTRAINT "BillingProcedure_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureTariff" ADD CONSTRAINT "ProcedureTariff_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "BillingProcedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureTariff" ADD CONSTRAINT "ProcedureTariff_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureTariff" ADD CONSTRAINT "ProcedureTariff_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProfessional" ADD CONSTRAINT "BillingProfessional_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProfessional" ADD CONSTRAINT "BillingProfessional_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProfessional" ADD CONSTRAINT "BillingProfessional_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Dados opcionais são pendências, não valores inventados.
ALTER TABLE "HealthOperator"
 ADD CONSTRAINT "HealthOperator_name_valid" CHECK (length(btrim("name")) > 0),
 ADD CONSTRAINT "HealthOperator_ans_valid" CHECK ("registrationAns" IS NULL OR "registrationAns" ~ '^[0-9]{6}$'),
 ADD CONSTRAINT "HealthOperator_version_valid" CHECK ("version" >= 1);
ALTER TABLE "OperatorContract"
 ADD CONSTRAINT "OperatorContract_name_valid" CHECK (length(btrim("name")) > 0),
 ADD CONSTRAINT "OperatorContract_code_valid" CHECK ("providerCode" IS NULL OR length(btrim("providerCode")) > 0),
 ADD CONSTRAINT "OperatorContract_cnes_valid" CHECK ("cnes" IS NULL OR "cnes" ~ '^[0-9]{7}$'),
 ADD CONSTRAINT "OperatorContract_tiss_valid" CHECK ("tissVersion" IS NULL OR "tissVersion" ~ '^[0-9]{1,2}\.[0-9]{2}\.[0-9]{2}$'),
 ADD CONSTRAINT "OperatorContract_version_valid" CHECK ("version" >= 1);
ALTER TABLE "AdministrativeConfigChange"
 ADD CONSTRAINT "AdministrativeConfigChange_origin" CHECK (num_nonnulls("operatorId","contractId","procedureId","tariffId","professionalId") = 1),
 ADD CONSTRAINT "AdministrativeConfigChange_values" CHECK ("version" >= 1 AND length(btrim("reason")) > 0
   AND "fingerprint" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("snapshot") = 'object');

CREATE FUNCTION administrative_config_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' OR TG_TABLE_NAME = 'AdministrativeConfigChange' THEN
   RAISE EXCEPTION 'Histórico administrativo preservado: operação não permitida' USING ERRCODE = '23514';
 END IF;
 IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR NEW."version" <> OLD."version" + 1 THEN
   RAISE EXCEPTION 'Identidade e versão administrativa inválidas' USING ERRCODE = '23514';
 END IF;
 IF TG_TABLE_NAME = 'OperatorContract' AND to_jsonb(NEW)->>'operatorId' IS DISTINCT FROM to_jsonb(OLD)->>'operatorId' THEN
   RAISE EXCEPTION 'Operadora do contrato é imutável' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "HealthOperator_preserve" BEFORE UPDATE OR DELETE ON "HealthOperator"
 FOR EACH ROW EXECUTE FUNCTION administrative_config_immutable();
CREATE TRIGGER "OperatorContract_preserve" BEFORE UPDATE OR DELETE ON "OperatorContract"
 FOR EACH ROW EXECUTE FUNCTION administrative_config_immutable();
CREATE TRIGGER "AdministrativeConfigChange_immutable" BEFORE UPDATE OR DELETE ON "AdministrativeConfigChange"
 FOR EACH ROW EXECUTE FUNCTION administrative_config_immutable();

-- A escrita e seu histórico entram na mesma transação, mesmo por SQL direto.
CREATE FUNCTION administrative_config_history_required() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_snapshot jsonb; matching boolean;
BEGIN
 IF TG_TABLE_NAME = 'HealthOperator' THEN
   expected_snapshot := jsonb_build_object('name', NEW."name", 'registrationAns', NEW."registrationAns", 'active', NEW."active");
   SELECT EXISTS(SELECT 1 FROM "AdministrativeConfigChange" WHERE "operatorId" = NEW."id"
     AND "version" = NEW."version" AND "actorId" = NEW."updatedById" AND "snapshot" = expected_snapshot) INTO matching;
 ELSE
   expected_snapshot := to_jsonb(NEW) - ARRAY['id','version','createdAt','updatedAt','createdById','updatedById'];
   SELECT EXISTS(SELECT 1 FROM "AdministrativeConfigChange" WHERE "contractId" = NEW."id"
     AND "version" = NEW."version" AND "actorId" = NEW."updatedById" AND "snapshot" = expected_snapshot) INTO matching;
 END IF;
 IF NOT matching THEN
   RAISE EXCEPTION 'Histórico administrativo obrigatório e consistente' USING ERRCODE = '23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "HealthOperator_history_required" AFTER INSERT OR UPDATE ON "HealthOperator"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION administrative_config_history_required();
CREATE CONSTRAINT TRIGGER "OperatorContract_history_required" AFTER INSERT OR UPDATE ON "OperatorContract"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION administrative_config_history_required();

-- Vigências inclusivas, inclusive sob concorrência e SQL direto.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "ProcedureTariff"
 ADD CONSTRAINT "ProcedureTariff_no_overlap" EXCLUDE USING gist
 ("procedureId" WITH =, daterange("startsOn", "endsOn", '[]') WITH &&) WHERE ("active"),
 ADD CONSTRAINT "ProcedureTariff_values" CHECK ("version" >= 1 AND "amountCents" BETWEEN 1 AND 99999999
 AND "startsOn" BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
 AND ("endsOn" IS NULL OR ("endsOn" >= "startsOn" AND "endsOn" <= DATE '2100-12-31')));
ALTER TABLE "BillingProcedure" ADD CONSTRAINT "BillingProcedure_values"
 CHECK ("version" >= 1 AND length(btrim("name")) > 0 AND "tableCode" ~ '^[^[:space:]]+$' AND "code" ~ '^[^[:space:]]+$');
ALTER TABLE "BillingProfessional" ADD CONSTRAINT "BillingProfessional_values"
 CHECK ("version" >= 1 AND length(btrim("name")) > 0 AND "purpose" IN ('SOLICITANTE','EXECUTANTE','AMBOS')
 AND ("councilCode" IS NULL OR "councilCode" ~ '^[0-9]{2}$')
 AND ("councilNumber" IS NULL OR length(btrim("councilNumber")) > 0)
 AND ("occupationCode" IS NULL OR "occupationCode" ~ '^[0-9]{6}$')
 AND ("councilState" IS NULL OR "councilState" IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')));


CREATE OR REPLACE FUNCTION administrative_config_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE identity_keys text[];
BEGIN
 IF TG_OP = 'DELETE' OR TG_TABLE_NAME = 'AdministrativeConfigChange' THEN
   RAISE EXCEPTION 'Histórico administrativo preservado: operação não permitida' USING ERRCODE = '23514';
 END IF;
 IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
 OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR NEW."version" <> OLD."version" + 1 THEN
   RAISE EXCEPTION 'Identidade e versão administrativa inválidas' USING ERRCODE = '23514';
 END IF;
 identity_keys := CASE TG_TABLE_NAME WHEN 'OperatorContract' THEN ARRAY['operatorId']
 WHEN 'BillingProcedure' THEN ARRAY['contractId','tableCode','code']
 WHEN 'ProcedureTariff' THEN ARRAY['procedureId'] ELSE ARRAY[]::text[] END;
 IF EXISTS (SELECT 1 FROM unnest(identity_keys) k WHERE to_jsonb(NEW)->k IS DISTINCT FROM to_jsonb(OLD)->k) THEN
   RAISE EXCEPTION 'Vínculo administrativo imutável' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION administrative_config_history_required() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_snapshot jsonb; matching boolean; origin_key text;
BEGIN
 expected_snapshot := to_jsonb(NEW) - ARRAY['id','version','createdAt','updatedAt','createdById','updatedById'];
 origin_key := CASE TG_TABLE_NAME WHEN 'HealthOperator' THEN 'operatorId' WHEN 'OperatorContract' THEN 'contractId'
 WHEN 'BillingProcedure' THEN 'procedureId' WHEN 'ProcedureTariff' THEN 'tariffId' WHEN 'BillingProfessional' THEN 'professionalId' END;
 SELECT EXISTS(SELECT 1 FROM "AdministrativeConfigChange" h WHERE to_jsonb(h)->>origin_key = NEW."id"
 AND h."version" = NEW."version" AND h."actorId" = NEW."updatedById" AND h."snapshot" = expected_snapshot) INTO matching;
 IF NOT matching THEN RAISE EXCEPTION 'Histórico administrativo obrigatório e consistente' USING ERRCODE = '23514'; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER "BillingProcedure_preserve" BEFORE UPDATE OR DELETE ON "BillingProcedure"
 FOR EACH ROW EXECUTE FUNCTION administrative_config_immutable();
CREATE TRIGGER "ProcedureTariff_preserve" BEFORE UPDATE OR DELETE ON "ProcedureTariff"
 FOR EACH ROW EXECUTE FUNCTION administrative_config_immutable();
CREATE TRIGGER "BillingProfessional_preserve" BEFORE UPDATE OR DELETE ON "BillingProfessional"
 FOR EACH ROW EXECUTE FUNCTION administrative_config_immutable();
CREATE CONSTRAINT TRIGGER "BillingProcedure_history_required" AFTER INSERT OR UPDATE ON "BillingProcedure"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION administrative_config_history_required();
CREATE CONSTRAINT TRIGGER "ProcedureTariff_history_required" AFTER INSERT OR UPDATE ON "ProcedureTariff"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION administrative_config_history_required();
CREATE CONSTRAINT TRIGGER "BillingProfessional_history_required" AFTER INSERT OR UPDATE ON "BillingProfessional"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION administrative_config_history_required();

