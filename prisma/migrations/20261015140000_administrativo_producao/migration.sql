CREATE TABLE "ProductionItem" (
 "id" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL REFERENCES "TreatmentSession"(id) ON DELETE RESTRICT,
 "coverageId" TEXT NOT NULL REFERENCES "BeneficiaryCoverage"(id) ON DELETE RESTRICT,
 "procedureId" TEXT NOT NULL REFERENCES "BillingProcedure"(id) ON DELETE RESTRICT,
 "quantity" INTEGER NOT NULL CHECK (quantity>0), "endTime" VARCHAR(5),
 "state" VARCHAR(12) NOT NULL DEFAULT 'PENDENTE' CHECK (state IN ('PENDENTE','APTO','INVALIDADO','FECHADO','ENVIADO')),
 "pendingReason" VARCHAR(300) NOT NULL, "sessionVersion" INTEGER NOT NULL, "executionOn" DATE NOT NULL,
 "useId" TEXT UNIQUE REFERENCES "AuthorizationUse"(id) ON DELETE RESTRICT,
 "snapshot" JSONB NOT NULL, "amountCents" BIGINT, "adjustmentPending" BOOLEAN NOT NULL DEFAULT false,
 "version" INTEGER NOT NULL DEFAULT 1 CHECK (version>0), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("endTime" IS NULL OR "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 CHECK ("amountCents" IS NULL OR "amountCents">0)
);
CREATE UNIQUE INDEX "ProductionItem_active_session_procedure" ON "ProductionItem"("sessionId","procedureId") WHERE state<>'INVALIDADO';
CREATE INDEX "ProductionItem_state_executionOn_id_idx" ON "ProductionItem"(state,"executionOn",id);
CREATE INDEX "ProductionItem_sessionId_idx" ON "ProductionItem"("sessionId");
CREATE INDEX "ProductionItem_coverageId_idx" ON "ProductionItem"("coverageId");
CREATE INDEX "ProductionItem_procedureId_idx" ON "ProductionItem"("procedureId");
CREATE TABLE "ProductionChange" (
 id TEXT PRIMARY KEY, "itemId" TEXT NOT NULL REFERENCES "ProductionItem"(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL, "actorId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
 reason VARCHAR(300) NOT NULL CHECK (length(btrim(reason))>0), "requestId" VARCHAR(36) NOT NULL UNIQUE,
 fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'), snapshot JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("itemId",version)
);
CREATE INDEX "ProductionChange_actorId_idx" ON "ProductionChange"("actorId");
CREATE TRIGGER "ProductionChange_immutable" BEFORE UPDATE OR DELETE ON "ProductionChange" FOR EACH ROW EXECUTE FUNCTION beneficiary_append_only();
CREATE FUNCTION production_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s "TreatmentSession"; c "BeneficiaryCoverage"; p "BillingProcedure"; u "AuthorizationUse"; mode text; t "ProcedureTariff";
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Produção preservada' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('administrativo:configuracao',0));
 SELECT * INTO s FROM "TreatmentSession" WHERE id=NEW."sessionId" FOR SHARE;
 SELECT * INTO c FROM "BeneficiaryCoverage" WHERE id=NEW."coverageId";
 SELECT * INTO p FROM "BillingProcedure" WHERE id=NEW."procedureId";
 IF c."patientId" IS DISTINCT FROM s."patientId" OR c."contractId" IS DISTINCT FROM p."contractId" THEN
 RAISE EXCEPTION 'Sessão, cobertura e procedimento incompatíveis' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.state NOT IN ('PENDENTE','APTO') THEN RAISE EXCEPTION 'Estado inicial inválido' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
 IF OLD.state='PENDENTE' AND NEW.state NOT IN ('PENDENTE','APTO','INVALIDADO') THEN RAISE EXCEPTION 'Confira antes de fechar' USING ERRCODE='23514'; END IF;
 IF NEW.state='FECHADO' AND OLD.state='APTO' AND ((to_jsonb(NEW)-ARRAY['state','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version']) OR s.status<>'VALIDO' OR NEW."sessionVersion"<>s.version) THEN RAISE EXCEPTION 'Fechamento exige snapshot conferido e sessão válida' USING ERRCODE='23514'; END IF;
 IF NEW.id<>OLD.id OR NEW."sessionId"<>OLD."sessionId" OR NEW."createdAt"<>OLD."createdAt" OR NEW.version<>OLD.version+1 OR OLD.state='INVALIDADO' THEN
 RAISE EXCEPTION 'Identidade/versão da produção inválida' USING ERRCODE='23514'; END IF;
 IF OLD.state IN ('FECHADO','ENVIADO') AND (to_jsonb(NEW)-ARRAY['adjustmentPending','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['adjustmentPending','version']) THEN
 RAISE EXCEPTION 'Produção fechada é imutável' USING ERRCODE='23514'; END IF;
 IF OLD."useId" IS NOT NULL AND NEW."useId" IS DISTINCT FROM OLD."useId" AND NOT EXISTS(SELECT 1 FROM "AuthorizationUse" WHERE "reversesId"=OLD."useId") THEN
 RAISE EXCEPTION 'Devolução do consumo obrigatória' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.state IN ('PENDENTE','INVALIDADO') AND NEW."useId" IS NOT NULL THEN RAISE EXCEPTION 'Estado não mantém consumo' USING ERRCODE='23514'; END IF;
 IF NEW.state='APTO' THEN
 IF NOT c.active OR NOT p.active OR NEW."executionOn"<c."startsOn" OR (c."endsOn" IS NOT NULL AND NEW."executionOn">c."endsOn")
 OR NOT EXISTS(SELECT 1 FROM "OperatorContract" ct JOIN "HealthOperator" o ON o.id=ct."operatorId" JOIN "Patient" pt ON pt.id=s."patientId" WHERE ct.id=c."contractId" AND ct.active AND o.active AND pt.status='ATIVO') THEN
 RAISE EXCEPTION 'Cobertura indisponível na execução' USING ERRCODE='23514'; END IF;
 SELECT * INTO t FROM "ProcedureTariff" WHERE id=NEW.snapshot->'tariff'->>'tariffId' AND "procedureId"=p.id AND active AND "startsOn"<=NEW."executionOn" AND ("endsOn" IS NULL OR "endsOn">=NEW."executionOn");
 IF t.id IS NULL OR t."amountCents"<>(NEW.snapshot->'tariff'->>'amountCents')::integer OR t.version<>(NEW.snapshot->'tariff'->>'tariffVersion')::integer OR NEW."amountCents"<>t."amountCents"::bigint*NEW.quantity THEN
 RAISE EXCEPTION 'Tarifa/snapshot incompatível' USING ERRCODE='23514'; END IF;

 IF s.status<>'VALIDO' OR NEW."sessionVersion"<>s.version OR NEW."executionOn"<>(s."occurredAt" AT TIME ZONE 'America/Sao_Paulo')::date THEN
 RAISE EXCEPTION 'Sessão alterada; confira novamente' USING ERRCODE='23514'; END IF;
 IF NEW."amountCents" IS NULL OR jsonb_typeof(NEW.snapshot)<>'object' OR NOT (NEW.snapshot ? 'tariff') THEN RAISE EXCEPTION 'Snapshot de tarifa obrigatório' USING ERRCODE='23514'; END IF;
 SELECT r.mode INTO mode FROM "ProcedureAuthorizationRule" r WHERE r."procedureId"=p.id ORDER BY version DESC LIMIT 1;
 IF mode IS NULL OR mode='PENDENTE' THEN RAISE EXCEPTION 'Regra contratual pendente' USING ERRCODE='23514'; END IF;
 IF mode='EXIGIDA' THEN
 SELECT * INTO u FROM "AuthorizationUse" WHERE id=NEW."useId";
 IF u.id IS NULL OR u.quantity<>NEW.quantity OR u."executionOn"<>NEW."executionOn" OR u.snapshot->>'coverageId'<>c.id OR u.snapshot->>'procedureId'<>p.id
 OR EXISTS(SELECT 1 FROM "AuthorizationUse" WHERE "reversesId"=u.id) THEN RAISE EXCEPTION 'Consumo incompatível com produção' USING ERRCODE='23514'; END IF;
 ELSIF NEW."useId" IS NOT NULL THEN RAISE EXCEPTION 'Dispensa não consome autorização' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ProductionItem_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ProductionItem" FOR EACH ROW EXECUTE FUNCTION production_guard();
CREATE FUNCTION production_history_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ProductionChange" WHERE "itemId"=NEW.id AND version=NEW.version AND snapshot=to_jsonb(NEW)) THEN
 RAISE EXCEPTION 'Histórico da produção obrigatório' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "ProductionItem_history" AFTER INSERT OR UPDATE ON "ProductionItem" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION production_history_required();
-- Correções clínicas nunca alteram snapshots fechados. Antes de fechar, devolução e pendência
-- são atômicas inclusive em SQL direto. Trigger diferida encontra a autoria da correção clínica.
CREATE FUNCTION production_clinical_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p "ProductionItem"; u "AuthorizationUse"; actor text; request text;
BEGIN
 IF (to_jsonb(NEW)-'updatedAt') IS NOT DISTINCT FROM (to_jsonb(OLD)-'updatedAt') THEN RETURN NULL; END IF;
 IF NEW.version<=OLD.version AND EXISTS(SELECT 1 FROM "ProductionItem" WHERE "sessionId"=NEW.id AND state<>'INVALIDADO') THEN
 RAISE EXCEPTION 'Correção clínica com produção exige nova versão' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('administrativo:configuracao',0));
 SELECT "editorId" INTO actor FROM "TreatmentSessionChange" WHERE "sessionId"=NEW.id AND version=NEW.version LIMIT 1;
 actor:=coalesce(NEW."invalidatedById",actor);
 IF actor IS NULL AND EXISTS(SELECT 1 FROM "ProductionItem" WHERE "sessionId"=NEW.id AND state<>'INVALIDADO') THEN
 RAISE EXCEPTION 'Autoria da correção clínica obrigatória para revisar produção' USING ERRCODE='23514'; END IF;
 FOR p IN SELECT * FROM "ProductionItem" WHERE "sessionId"=NEW.id AND state<>'INVALIDADO' ORDER BY id FOR UPDATE LOOP
 request:=gen_random_uuid()::text;
 IF p.state NOT IN ('FECHADO','ENVIADO') THEN
 IF p."useId" IS NOT NULL THEN
 SELECT * INTO u FROM "AuthorizationUse" WHERE id=p."useId";
 INSERT INTO "AuthorizationUse" (id,"itemId",quantity,"executionOn","reversesId","sourceKey","requestId",fingerprint,snapshot,reason,"actorId")
 VALUES (gen_random_uuid()::text,u."itemId",-u.quantity,u."executionOn",u.id,'return:'||u.id,gen_random_uuid()::text,encode(sha256(convert_to(request,'UTF8')),'hex'),u.snapshot,'Revisão clínica: conferir produção novamente',actor);
 END IF;
 UPDATE "ProductionItem" SET state='PENDENTE',"pendingReason"='Sessão corrigida ou invalidada: revisar dados e conferir novamente',"useId"=NULL,version=version+1 WHERE id=p.id;
 ELSE
 UPDATE "ProductionItem" SET "adjustmentPending"=true,version=version+1 WHERE id=p.id;
 END IF;
 INSERT INTO "ProductionChange" (id,"itemId",version,"actorId",reason,"requestId",fingerprint,snapshot)
 SELECT gen_random_uuid()::text,id,version,actor,'Alteração clínica: revisão administrativa necessária',request,encode(sha256(convert_to(request,'UTF8')),'hex'),to_jsonb(i) FROM "ProductionItem" i WHERE id=p.id;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "TreatmentSession_production" AFTER UPDATE ON "TreatmentSession" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION production_clinical_change();

CREATE FUNCTION production_return_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."reversesId" IS NOT NULL AND EXISTS(SELECT 1 FROM "ProductionItem" WHERE "useId"=NEW."reversesId" AND state IN ('APTO','FECHADO','ENVIADO')) THEN
 RAISE EXCEPTION 'Devolução exige revisão da produção; item fechado preservado' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "AuthorizationUse_production" AFTER INSERT ON "AuthorizationUse" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION production_return_required();
