-- CreateTable
CREATE TABLE "BeneficiaryCoverage" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "beneficiaryName" VARCHAR(120) NOT NULL,
    "cardNumber" VARCHAR(60) NOT NULL,
    "planName" VARCHAR(120),
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "BeneficiaryCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitAuthorization" (
    "id" TEXT NOT NULL,
    "coverageId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "number" VARCHAR(60) NOT NULL,
    "accessCode" VARCHAR(60),
    "issuedOn" DATE NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "BenefitAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorizationItem" (
    "id" TEXT NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "authorizedQuantity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "AuthorizationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorizationUse" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "executionOn" DATE NOT NULL,
    "reversesId" TEXT,
    "sourceKey" VARCHAR(100) NOT NULL,
    "requestId" VARCHAR(36) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorizationUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficiaryChange" (
    "id" TEXT NOT NULL,
    "coverageId" TEXT,
    "authorizationId" TEXT,
    "itemId" TEXT,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "requestId" VARCHAR(36) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeneficiaryChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcedureAuthorizationRule" (
    "id" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "mode" VARCHAR(12) NOT NULL,
    "reference" VARCHAR(300) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "requestId" VARCHAR(36) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcedureAuthorizationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BeneficiaryCoverage_patientId_startsOn_id_idx" ON "BeneficiaryCoverage"("patientId", "startsOn", "id");

-- CreateIndex
CREATE INDEX "BeneficiaryCoverage_contractId_idx" ON "BeneficiaryCoverage"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "BeneficiaryCoverage_id_contractId_key" ON "BeneficiaryCoverage"("id", "contractId");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitAuthorization_id_contractId_key" ON "BenefitAuthorization"("id", "contractId");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitAuthorization_coverageId_number_key" ON "BenefitAuthorization"("coverageId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizationItem_authorizationId_procedureId_key" ON "AuthorizationItem"("authorizationId", "procedureId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizationUse_reversesId_key" ON "AuthorizationUse"("reversesId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizationUse_sourceKey_key" ON "AuthorizationUse"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizationUse_requestId_key" ON "AuthorizationUse"("requestId");

-- CreateIndex
CREATE INDEX "AuthorizationUse_itemId_idx" ON "AuthorizationUse"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "BeneficiaryChange_requestId_key" ON "BeneficiaryChange"("requestId");

-- CreateIndex
CREATE INDEX "BeneficiaryChange_actorId_idx" ON "BeneficiaryChange"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "BeneficiaryChange_coverageId_version_key" ON "BeneficiaryChange"("coverageId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "BeneficiaryChange_authorizationId_version_key" ON "BeneficiaryChange"("authorizationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "BeneficiaryChange_itemId_version_key" ON "BeneficiaryChange"("itemId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProcedureAuthorizationRule_requestId_key" ON "ProcedureAuthorizationRule"("requestId");

-- CreateIndex
CREATE INDEX "ProcedureAuthorizationRule_actorId_idx" ON "ProcedureAuthorizationRule"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcedureAuthorizationRule_procedureId_version_key" ON "ProcedureAuthorizationRule"("procedureId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "BillingProcedure_id_contractId_key" ON "BillingProcedure"("id", "contractId");

-- AddForeignKey
ALTER TABLE "BeneficiaryCoverage" ADD CONSTRAINT "BeneficiaryCoverage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryCoverage" ADD CONSTRAINT "BeneficiaryCoverage_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OperatorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryCoverage" ADD CONSTRAINT "BeneficiaryCoverage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryCoverage" ADD CONSTRAINT "BeneficiaryCoverage_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitAuthorization" ADD CONSTRAINT "BenefitAuthorization_coverageId_contractId_fkey" FOREIGN KEY ("coverageId", "contractId") REFERENCES "BeneficiaryCoverage"("id", "contractId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitAuthorization" ADD CONSTRAINT "BenefitAuthorization_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OperatorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitAuthorization" ADD CONSTRAINT "BenefitAuthorization_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitAuthorization" ADD CONSTRAINT "BenefitAuthorization_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationItem" ADD CONSTRAINT "AuthorizationItem_authorizationId_contractId_fkey" FOREIGN KEY ("authorizationId", "contractId") REFERENCES "BenefitAuthorization"("id", "contractId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationItem" ADD CONSTRAINT "AuthorizationItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OperatorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationItem" ADD CONSTRAINT "AuthorizationItem_procedureId_contractId_fkey" FOREIGN KEY ("procedureId", "contractId") REFERENCES "BillingProcedure"("id", "contractId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationItem" ADD CONSTRAINT "AuthorizationItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationItem" ADD CONSTRAINT "AuthorizationItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationUse" ADD CONSTRAINT "AuthorizationUse_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AuthorizationItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationUse" ADD CONSTRAINT "AuthorizationUse_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "AuthorizationUse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizationUse" ADD CONSTRAINT "AuthorizationUse_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryChange" ADD CONSTRAINT "BeneficiaryChange_coverageId_fkey" FOREIGN KEY ("coverageId") REFERENCES "BeneficiaryCoverage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryChange" ADD CONSTRAINT "BeneficiaryChange_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "BenefitAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryChange" ADD CONSTRAINT "BeneficiaryChange_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AuthorizationItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryChange" ADD CONSTRAINT "BeneficiaryChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureAuthorizationRule" ADD CONSTRAINT "ProcedureAuthorizationRule_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "BillingProcedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureAuthorizationRule" ADD CONSTRAINT "ProcedureAuthorizationRule_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BeneficiaryCoverage" ADD CONSTRAINT "BeneficiaryCoverage_values" CHECK
 ("version" >= 1 AND length(btrim("beneficiaryName")) > 0 AND length(btrim("cardNumber")) > 0
 AND "startsOn" BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
 AND ("endsOn" IS NULL OR ("endsOn" >= "startsOn" AND "endsOn" <= DATE '2100-12-31')));
ALTER TABLE "BenefitAuthorization" ADD CONSTRAINT "BenefitAuthorization_values" CHECK
 ("version" >= 1 AND length(btrim("number")) > 0 AND ("accessCode" IS NULL OR length(btrim("accessCode")) > 0)
 AND "issuedOn" BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
 AND "startsOn" BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
 AND "endsOn" BETWEEN "startsOn" AND DATE '2100-12-31');
ALTER TABLE "AuthorizationItem" ADD CONSTRAINT "AuthorizationItem_values" CHECK ("version" >= 1 AND "authorizedQuantity" > 0);
ALTER TABLE "BeneficiaryChange" ADD CONSTRAINT "BeneficiaryChange_values" CHECK
 (num_nonnulls("coverageId","authorizationId","itemId") = 1 AND "version" >= 1 AND length(btrim("reason")) > 0
 AND "fingerprint" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("snapshot") = 'object');
ALTER TABLE "AuthorizationUse" ADD CONSTRAINT "AuthorizationUse_values" CHECK
 (("quantity" > 0 AND "reversesId" IS NULL OR "quantity" < 0 AND "reversesId" IS NOT NULL)
 AND length(btrim("reason")) > 0 AND length(btrim("sourceKey")) > 0
 AND "fingerprint" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("snapshot") = 'object'
 AND "executionOn" BETWEEN DATE '2000-01-01' AND DATE '2100-12-31');
ALTER TABLE "ProcedureAuthorizationRule" ADD CONSTRAINT "ProcedureAuthorizationRule_values" CHECK
 ("mode" IN ('EXIGIDA','DISPENSADA','PENDENTE') AND "version" >= 1 AND length(btrim("reference")) > 0
 AND length(btrim("reason")) > 0 AND "fingerprint" ~ '^[0-9a-f]{64}$');

-- Serializa a elegibilidade com inativação cadastral, inclusive fora deste módulo.
CREATE FUNCTION beneficiary_parent_lock(patient_id text, contract_id text, procedure_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM o.id FROM "HealthOperator" o JOIN "OperatorContract" c ON c."operatorId"=o.id WHERE c.id=contract_id FOR SHARE OF o;
 PERFORM id FROM "OperatorContract" WHERE id=contract_id FOR SHARE;
 PERFORM id FROM "Patient" WHERE id=patient_id FOR SHARE;
 IF procedure_id IS NOT NULL THEN PERFORM id FROM "BillingProcedure" WHERE id=procedure_id FOR SHARE; END IF;
END $$;
CREATE FUNCTION beneficiary_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "BeneficiaryCoverage"; a "BenefitAuthorization"; p "BillingProcedure";
 consumed bigint; parent_active boolean; keys text[]; parent_id text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('administrativo:configuracao',0));
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Histórico do beneficiário preservado' USING ERRCODE='23514'; END IF;
 IF TG_OP = 'UPDATE' THEN
   IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
   OR NEW."createdById" IS DISTINCT FROM OLD."createdById" OR NEW."version" <> OLD."version"+1 THEN
     RAISE EXCEPTION 'Identidade e versão inválidas' USING ERRCODE='23514';
   END IF;
   keys := CASE TG_TABLE_NAME WHEN 'BeneficiaryCoverage' THEN ARRAY['patientId','contractId']
     WHEN 'BenefitAuthorization' THEN ARRAY['coverageId','contractId'] ELSE ARRAY['authorizationId','contractId','procedureId'] END;
   IF EXISTS(SELECT 1 FROM unnest(keys) k WHERE to_jsonb(NEW)->k IS DISTINCT FROM to_jsonb(OLD)->k) THEN
     RAISE EXCEPTION 'Vínculo de cobertura/autorização imutável' USING ERRCODE='23514';
   END IF;
 END IF;
 IF TG_TABLE_NAME = 'BeneficiaryCoverage' THEN
   PERFORM beneficiary_parent_lock(NEW."patientId",NEW."contractId");
   SELECT coalesce(sum(u."quantity"),0) INTO consumed FROM "AuthorizationUse" u
    JOIN "AuthorizationItem" i ON i.id=u."itemId" JOIN "BenefitAuthorization" au ON au.id=i."authorizationId" WHERE au."coverageId"=NEW.id;
   IF TG_OP='UPDATE' AND consumed>0 THEN RAISE EXCEPTION 'Há consumo vigente; corrija/devolva a produção antes de alterar a cobertura' USING ERRCODE='23514'; END IF;
   SELECT o.active AND ct.active AND pt.status='ATIVO' INTO parent_active FROM "OperatorContract" ct
    JOIN "HealthOperator" o ON o.id=ct."operatorId" JOIN "Patient" pt ON pt.id=NEW."patientId" WHERE ct.id=NEW."contractId";
 ELSIF TG_TABLE_NAME = 'BenefitAuthorization' THEN
   SELECT * INTO c FROM "BeneficiaryCoverage" WHERE id=NEW."coverageId";
   PERFORM beneficiary_parent_lock(c."patientId",NEW."contractId");
   SELECT coalesce(sum(u."quantity"),0) INTO consumed FROM "AuthorizationUse" u JOIN "AuthorizationItem" i ON i.id=u."itemId" WHERE i."authorizationId"=NEW.id;
   IF TG_OP='UPDATE' AND consumed>0 THEN RAISE EXCEPTION 'Há consumo vigente; autorização não pode ser corrigida ou cancelada' USING ERRCODE='23514'; END IF;
   IF NEW."startsOn"<c."startsOn" OR (c."endsOn" IS NOT NULL AND NEW."endsOn">c."endsOn") THEN
     RAISE EXCEPTION 'Vigência da autorização deve estar dentro da cobertura' USING ERRCODE='23514';
   END IF;
   SELECT c.active AND ct.active AND o.active AND pt.status='ATIVO' INTO parent_active FROM "OperatorContract" ct
    JOIN "HealthOperator" o ON o.id=ct."operatorId" JOIN "Patient" pt ON pt.id=c."patientId" WHERE ct.id=NEW."contractId";
 ELSE
   SELECT * INTO a FROM "BenefitAuthorization" WHERE id=NEW."authorizationId";
   SELECT * INTO c FROM "BeneficiaryCoverage" WHERE id=a."coverageId";
   SELECT * INTO p FROM "BillingProcedure" WHERE id=NEW."procedureId";
   PERFORM beneficiary_parent_lock(c."patientId",NEW."contractId",p.id);
   SELECT coalesce(sum("quantity"),0) INTO consumed FROM "AuthorizationUse" WHERE "itemId"=NEW.id;
   IF NEW."authorizedQuantity"<consumed OR (NOT NEW.active AND consumed>0) THEN
     RAISE EXCEPTION 'Quantidade ou cancelamento incompatível com consumo vigente' USING ERRCODE='23514';
   END IF;
   SELECT a.active AND c.active AND p.active AND ct.active AND o.active AND pt.status='ATIVO' INTO parent_active FROM "OperatorContract" ct
    JOIN "HealthOperator" o ON o.id=ct."operatorId" JOIN "Patient" pt ON pt.id=c."patientId" WHERE ct.id=NEW."contractId";
 END IF;
 IF (TG_OP='INSERT' OR NEW.active) AND coalesce(parent_active,false)=false THEN
   RAISE EXCEPTION 'Paciente, operadora, contrato, cobertura, autorização ou procedimento indisponível' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION beneficiary_history_required() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE origin_key text; expected jsonb;
BEGIN
 origin_key := CASE TG_TABLE_NAME WHEN 'BeneficiaryCoverage' THEN 'coverageId' WHEN 'BenefitAuthorization' THEN 'authorizationId' ELSE 'itemId' END;
 expected := to_jsonb(NEW)-ARRAY['id','version','createdAt','updatedAt','createdById','updatedById'];
 IF NOT EXISTS(SELECT 1 FROM "BeneficiaryChange" h WHERE to_jsonb(h)->>origin_key=NEW.id
 AND h.version=NEW.version AND h."actorId"=NEW."updatedById" AND h.snapshot=expected) THEN
   RAISE EXCEPTION 'Histórico do beneficiário obrigatório e consistente' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION beneficiary_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Histórico/consumo imutável; registre uma devolução explícita' USING ERRCODE='23514'; END $$;
CREATE TRIGGER "BeneficiaryCoverage_guard" BEFORE INSERT OR UPDATE OR DELETE ON "BeneficiaryCoverage" FOR EACH ROW EXECUTE FUNCTION beneficiary_write_guard();
CREATE TRIGGER "BenefitAuthorization_guard" BEFORE INSERT OR UPDATE OR DELETE ON "BenefitAuthorization" FOR EACH ROW EXECUTE FUNCTION beneficiary_write_guard();
CREATE TRIGGER "AuthorizationItem_guard" BEFORE INSERT OR UPDATE OR DELETE ON "AuthorizationItem" FOR EACH ROW EXECUTE FUNCTION beneficiary_write_guard();
CREATE CONSTRAINT TRIGGER "BeneficiaryCoverage_history" AFTER INSERT OR UPDATE ON "BeneficiaryCoverage" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION beneficiary_history_required();
CREATE CONSTRAINT TRIGGER "BenefitAuthorization_history" AFTER INSERT OR UPDATE ON "BenefitAuthorization" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION beneficiary_history_required();
CREATE CONSTRAINT TRIGGER "AuthorizationItem_history" AFTER INSERT OR UPDATE ON "AuthorizationItem" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION beneficiary_history_required();
CREATE TRIGGER "BeneficiaryChange_immutable" BEFORE UPDATE OR DELETE ON "BeneficiaryChange" FOR EACH ROW EXECUTE FUNCTION beneficiary_append_only();
CREATE TRIGGER "AuthorizationUse_immutable" BEFORE UPDATE OR DELETE ON "AuthorizationUse" FOR EACH ROW EXECUTE FUNCTION beneficiary_append_only();
CREATE TRIGGER "ProcedureAuthorizationRule_immutable" BEFORE UPDATE OR DELETE ON "ProcedureAuthorizationRule" FOR EACH ROW EXECUTE FUNCTION beneficiary_append_only();
CREATE FUNCTION authorization_rule_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('administrativo:configuracao',0));
 IF NEW.version<>(SELECT coalesce(max(version),0)+1 FROM "ProcedureAuthorizationRule" WHERE "procedureId"=NEW."procedureId") THEN
   RAISE EXCEPTION 'Versão da regra alterada; recarregue' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM "BillingProcedure" p JOIN "OperatorContract" c ON c.id=p."contractId"
 JOIN "HealthOperator" o ON o.id=c."operatorId" WHERE p.id=NEW."procedureId" AND p.active AND c.active AND o.active) THEN
   RAISE EXCEPTION 'Procedimento ou contrato inativo' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ProcedureAuthorizationRule_guard" BEFORE INSERT ON "ProcedureAuthorizationRule" FOR EACH ROW EXECUTE FUNCTION authorization_rule_guard();
CREATE FUNCTION authorization_use_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE i "AuthorizationItem"; a "BenefitAuthorization"; c "BeneficiaryCoverage"; original "AuthorizationUse";
 used bigint; valid boolean; rule_mode text; rule_version integer; p "BillingProcedure";
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('administrativo:configuracao',0));
 SELECT * INTO i FROM "AuthorizationItem" WHERE id=NEW."itemId";
 SELECT * INTO a FROM "BenefitAuthorization" WHERE id=i."authorizationId" FOR UPDATE;
 SELECT * INTO c FROM "BeneficiaryCoverage" WHERE id=a."coverageId";
 IF NEW."reversesId" IS NOT NULL THEN
   SELECT * INTO original FROM "AuthorizationUse" WHERE id=NEW."reversesId";
   IF original.id IS NULL OR original."reversesId" IS NOT NULL OR original."itemId"<>NEW."itemId" OR NEW.quantity<> -original.quantity
     OR NEW."executionOn"<>original."executionOn" THEN RAISE EXCEPTION 'Devolução deve corresponder ao consumo original completo' USING ERRCODE='23514'; END IF;
   NEW.snapshot:=original.snapshot;
   RETURN NEW;
 END IF;
 SELECT * INTO p FROM "BillingProcedure" WHERE id=i."procedureId";
 PERFORM beneficiary_parent_lock(c."patientId",c."contractId",p.id);
 SELECT mode,version INTO rule_mode,rule_version FROM "ProcedureAuthorizationRule" WHERE "procedureId"=p.id ORDER BY version DESC LIMIT 1;
 IF rule_mode IS DISTINCT FROM 'EXIGIDA' THEN RAISE EXCEPTION 'Regra pendente ou dispensada não permite consumo de autorização' USING ERRCODE='23514'; END IF;
 SELECT i.active AND a.active AND c.active AND p.active AND ct.active AND o.active AND pt.status='ATIVO' INTO valid
 FROM "OperatorContract" ct JOIN "HealthOperator" o ON o.id=ct."operatorId" JOIN "Patient" pt ON pt.id=c."patientId" WHERE ct.id=c."contractId";
 IF NOT coalesce(valid,false) OR p."contractId"<>c."contractId" OR NEW."executionOn"<c."startsOn"
 OR (c."endsOn" IS NOT NULL AND NEW."executionOn">c."endsOn") OR NEW."executionOn" NOT BETWEEN a."startsOn" AND a."endsOn" THEN
   RAISE EXCEPTION 'Cobertura/autorização indisponível na data da execução' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(sum(quantity),0) INTO used FROM "AuthorizationUse" WHERE "itemId"=i.id;
 IF used+NEW.quantity>i."authorizedQuantity" THEN RAISE EXCEPTION 'Saldo autorizado insuficiente' USING ERRCODE='23514'; END IF;
 NEW.snapshot:=jsonb_build_object('patientId',c."patientId",'coverageId',c.id,'coverageVersion',c.version,'contractId',c."contractId",
 'beneficiaryName',c."beneficiaryName",'cardNumber',c."cardNumber",'planName',c."planName",'coverageStartsOn',c."startsOn",'coverageEndsOn',c."endsOn",
 'authorizationId',a.id,'authorizationVersion',a.version,'authorizationNumber',a.number,'accessCode',a."accessCode",
 'authorizationStartsOn',a."startsOn",'authorizationEndsOn',a."endsOn",'itemId',i.id,'itemVersion',i.version,
 'procedureId',p.id,'procedureVersion',p.version,'tableCode',p."tableCode",'code',p.code,'ruleVersion',rule_version);
 RETURN NEW;
END $$;
CREATE TRIGGER "AuthorizationUse_guard" BEFORE INSERT ON "AuthorizationUse" FOR EACH ROW EXECUTE FUNCTION authorization_use_guard();

