-- CreateTable
CREATE TABLE "BatchSequence" (
    "contractId" TEXT NOT NULL,
    "lastNumber" BIGINT NOT NULL,

    CONSTRAINT "BatchSequence_pkey" PRIMARY KEY ("contractId")
);

-- CreateTable
CREATE TABLE "BillingBatch" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "number" BIGINT NOT NULL,
    "tissVersion" VARCHAR(8) NOT NULL,
    "state" VARCHAR(12) NOT NULL DEFAULT 'ABERTO',
    "version" INTEGER NOT NULL DEFAULT 1,
    "contentVersion" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMPTZ(3),
    "contentDigest" VARCHAR(64) NOT NULL DEFAULT '',
    "snapshot" JSONB NOT NULL,
    "totalCents" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchGuide" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "closedGuideVersion" INTEGER,

    CONSTRAINT "BatchGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchChange" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "requestId" VARCHAR(36) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchArtifact" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contentVersion" INTEGER NOT NULL,
    "contentDigest" VARCHAR(64) NOT NULL,
    "bytes" BYTEA NOT NULL,
    "fileHash" VARCHAR(64) NOT NULL,
    "validationReference" VARCHAR(300) NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" VARCHAR(36) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchSend" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "correctsId" TEXT,
    "sentOn" DATE NOT NULL,
    "protocol" VARCHAR(120) NOT NULL,
    "channel" VARCHAR(120) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" VARCHAR(36) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingBatch_state_createdAt_id_idx" ON "BillingBatch"("state", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BillingBatch_contractId_number_key" ON "BillingBatch"("contractId", "number");

-- CreateIndex
CREATE INDEX "BatchGuide_batchId_idx" ON "BatchGuide"("batchId");

-- CreateIndex
CREATE INDEX "BatchGuide_guideId_idx" ON "BatchGuide"("guideId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchChange_requestId_key" ON "BatchChange"("requestId");

-- CreateIndex
CREATE INDEX "BatchChange_actorId_idx" ON "BatchChange"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchChange_batchId_version_key" ON "BatchChange"("batchId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "BatchArtifact_requestId_key" ON "BatchArtifact"("requestId");

-- CreateIndex
CREATE INDEX "BatchArtifact_actorId_idx" ON "BatchArtifact"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchArtifact_batchId_version_key" ON "BatchArtifact"("batchId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "BatchSend_correctsId_key" ON "BatchSend"("correctsId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchSend_requestId_key" ON "BatchSend"("requestId");

-- CreateIndex
CREATE INDEX "BatchSend_batchId_createdAt_id_idx" ON "BatchSend"("batchId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "BatchSend_actorId_idx" ON "BatchSend"("actorId");

-- AddForeignKey
ALTER TABLE "BatchSequence" ADD CONSTRAINT "BatchSequence_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OperatorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingBatch" ADD CONSTRAINT "BillingBatch_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OperatorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchGuide" ADD CONSTRAINT "BatchGuide_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BillingBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchGuide" ADD CONSTRAINT "BatchGuide_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "BillingGuide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchChange" ADD CONSTRAINT "BatchChange_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BillingBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchChange" ADD CONSTRAINT "BatchChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchArtifact" ADD CONSTRAINT "BatchArtifact_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BillingBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchArtifact" ADD CONSTRAINT "BatchArtifact_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchSend" ADD CONSTRAINT "BatchSend_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BillingBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchSend" ADD CONSTRAINT "BatchSend_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "BatchArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchSend" ADD CONSTRAINT "BatchSend_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchSend" ADD CONSTRAINT "BatchSend_correctsId_fkey" FOREIGN KEY ("correctsId") REFERENCES "BatchSend"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BatchSequence" ADD CHECK("lastNumber">0);
ALTER TABLE "BillingBatch" ADD CHECK(number>0 AND version>0 AND "totalCents">=0 AND state IN ('ABERTO','FECHADO','ENVIADO','CANCELADO'));
ALTER TABLE "BatchChange" ADD CHECK(length(btrim(reason))>0 AND fingerprint ~ '^[0-9a-f]{64}$');
ALTER TABLE "BatchArtifact" ADD CHECK(version>0 AND "contentVersion">0 AND octet_length(bytes)>0 AND "fileHash"=encode(sha256(bytes),'hex') AND length(btrim("validationReference"))>0);
ALTER TABLE "BatchSend" ADD CHECK(length(btrim(protocol))>0 AND length(btrim(channel))>0 AND length(btrim(reason))>0 AND "sentOn">='2000-01-01' AND "sentOn"<='2100-12-31');
CREATE UNIQUE INDEX "BatchGuide_active_guide" ON "BatchGuide"("guideId") WHERE active;
CREATE UNIQUE INDEX "BatchSend_first_batch" ON "BatchSend"("batchId") WHERE "correctsId" IS NULL;
CREATE TRIGGER "BatchChange_immutable" BEFORE UPDATE OR DELETE ON "BatchChange" FOR EACH ROW EXECUTE FUNCTION beneficiary_append_only();
CREATE TRIGGER "BatchArtifact_immutable" BEFORE UPDATE OR DELETE ON "BatchArtifact" FOR EACH ROW EXECUTE FUNCTION beneficiary_append_only();
CREATE TRIGGER "BatchSend_immutable" BEFORE UPDATE OR DELETE ON "BatchSend" FOR EACH ROW EXECUTE FUNCTION beneficiary_append_only();
CREATE FUNCTION batch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Lote preservado' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.state<>'ABERTO' THEN RAISE EXCEPTION 'Lote inicia aberto' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
 IF NEW.id<>OLD.id OR NEW."contractId"<>OLD."contractId" OR NEW.number<>OLD.number OR NEW."tissVersion"<>OLD."tissVersion" OR NEW."createdAt"<>OLD."createdAt" OR (NEW.version<>OLD.version+1 AND NOT(NEW.version=OLD.version AND OLD.state='ABERTO' AND NOT EXISTS(SELECT 1 FROM "BatchChange" WHERE "batchId"=OLD.id AND version=OLD.version))) THEN RAISE EXCEPTION 'Identidade/versão do lote inválida' USING ERRCODE='23514'; END IF;
 IF OLD.state='CANCELADO' OR (OLD.state='ENVIADO' AND (NEW.state<>'ENVIADO' OR (to_jsonb(NEW)-'version') IS DISTINCT FROM (to_jsonb(OLD)-'version'))) OR (OLD.state='FECHADO' AND (NEW.state NOT IN ('ENVIADO','CANCELADO') OR (to_jsonb(NEW)-ARRAY['state','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version']))) THEN RAISE EXCEPTION 'Lote fechado/enviado é preservado' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.state IN ('FECHADO','ENVIADO') AND (NEW."closedAt" IS NULL OR NEW."contentVersion"<>1 OR NEW."contentDigest" !~ '^[0-9a-f]{64}$' OR NEW.snapshot='{}'::jsonb OR NEW."totalCents"<=0) THEN RAISE EXCEPTION 'Fechamento incompleto' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "BillingBatch_guard" BEFORE INSERT OR UPDATE OR DELETE ON "BillingBatch" FOR EACH ROW EXECUTE FUNCTION batch_guard();
CREATE FUNCTION batch_guide_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b "BillingBatch"; g "BillingGuide";
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Vínculo de lote preservado' USING ERRCODE='23514'; END IF;
 SELECT * INTO b FROM "BillingBatch" WHERE id=NEW."batchId" FOR UPDATE;
 SELECT * INTO g FROM "BillingGuide" WHERE id=NEW."guideId";
 IF TG_OP='UPDATE' AND (NOT OLD.active OR NEW.id<>OLD.id OR NEW."batchId"<>OLD."batchId" OR NEW."guideId"<>OLD."guideId") THEN RAISE EXCEPTION 'Vínculo de lote imutável' USING ERRCODE='23514'; END IF;
 IF NEW.active AND TG_OP='INSERT' AND (b.state<>'ABERTO' OR g.state<>'APTA' OR g."contractId"<>b."contractId" OR g.snapshot->'contract'->>'tissVersion' IS DISTINCT FROM b."tissVersion") THEN RAISE EXCEPTION 'Guia incompatível com lote' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((b.state IN ('FECHADO','ENVIADO')) OR (b.state='CANCELADO' AND NEW.active)) THEN RAISE EXCEPTION 'Composição fechada preservada' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "BatchGuide_guard" BEFORE INSERT OR UPDATE OR DELETE ON "BatchGuide" FOR EACH ROW EXECUTE FUNCTION batch_guide_guard();
CREATE FUNCTION batch_artifact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b "BillingBatch"; lim integer;
BEGIN
 SELECT * INTO b FROM "BillingBatch" WHERE id=NEW."batchId" FOR UPDATE;
 SELECT "maxXmlBytes" INTO lim FROM "OperatorContract" WHERE id=b."contractId";
 IF b.state NOT IN ('FECHADO','ENVIADO') OR NEW."contentDigest"<>b."contentDigest" OR NEW."contentVersion"<>b."contentVersion" OR octet_length(NEW.bytes)>least(lim,coalesce((b.snapshot->'contract'->>'maxXmlBytes')::integer,lim)) OR NEW.version<>(SELECT coalesce(max(version),0)+1 FROM "BatchArtifact" WHERE "batchId"=b.id) THEN RAISE EXCEPTION 'Artefato não corresponde ao conteúdo fechado ou excede limite' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "BatchArtifact_guard" BEFORE INSERT ON "BatchArtifact" FOR EACH ROW EXECUTE FUNCTION batch_artifact_guard();
CREATE FUNCTION batch_send_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b "BillingBatch"; a "BatchArtifact"; previous "BatchSend";
BEGIN
 SELECT * INTO b FROM "BillingBatch" WHERE id=NEW."batchId" FOR UPDATE;
 SELECT * INTO a FROM "BatchArtifact" WHERE id=NEW."artifactId";
 IF b.state NOT IN ('FECHADO','ENVIADO') OR a.id IS NULL OR a."batchId"<>b.id OR a."contentDigest"<>b."contentDigest" OR NEW."sentOn"<(b."closedAt" AT TIME ZONE 'America/Sao_Paulo')::date OR NEW."sentOn"<(a."createdAt" AT TIME ZONE 'America/Sao_Paulo')::date OR NEW."sentOn">(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Envio exige arquivo validado do lote e data compatível' USING ERRCODE='23514'; END IF;
 IF NEW."correctsId" IS NULL AND b.state<>'FECHADO' THEN RAISE EXCEPTION 'Envio original já registrado' USING ERRCODE='23514'; END IF;
 IF NEW."correctsId" IS NOT NULL THEN SELECT * INTO previous FROM "BatchSend" WHERE id=NEW."correctsId";IF b.state<>'ENVIADO' OR previous.id IS NULL OR previous."batchId"<>b.id OR EXISTS(SELECT 1 FROM "BatchSend" WHERE "correctsId"=previous.id) THEN RAISE EXCEPTION 'Correção deve referenciar último registro de envio' USING ERRCODE='23514'; END IF;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "BatchSend_guard" BEFORE INSERT ON "BatchSend" FOR EACH ROW EXECUTE FUNCTION batch_send_guard();
CREATE FUNCTION batch_history_required() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bid text; b "BillingBatch"; links jsonb; sends jsonb;
BEGIN
 IF TG_TABLE_NAME='BillingBatch' THEN bid=NEW.id; ELSE bid=NEW."batchId";END IF;
 SELECT * INTO b FROM "BillingBatch" WHERE id=bid;
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]'::jsonb) INTO links FROM "BatchGuide" i WHERE i."batchId"=bid;
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]'::jsonb) INTO sends FROM "BatchSend" i WHERE i."batchId"=bid;
 IF NOT EXISTS(SELECT 1 FROM "BatchChange" WHERE "batchId"=bid AND version=b.version AND snapshot=jsonb_build_object('batch',to_jsonb(b),'guides',links,'sends',sends)) THEN RAISE EXCEPTION 'Histórico completo do lote obrigatório' USING ERRCODE='23514'; END IF;
 IF b.state IN ('FECHADO','ENVIADO') AND (NOT EXISTS(SELECT 1 FROM "BatchGuide" WHERE "batchId"=bid AND active) OR EXISTS(SELECT 1 FROM "BatchGuide" bg JOIN "BillingGuide" g ON g.id=bg."guideId" WHERE bg."batchId"=bid AND bg.active AND (g.state<>'EM_LOTE' OR g.version<>bg."closedGuideVersion")) OR b."totalCents"<>(SELECT coalesce(sum(g."totalCents"),0) FROM "BatchGuide" bg JOIN "BillingGuide" g ON g.id=bg."guideId" WHERE bg."batchId"=bid AND bg.active)) THEN RAISE EXCEPTION 'Guias/total não reconciliam com lote fechado' USING ERRCODE='23514'; END IF;
 IF b.state IN ('FECHADO','ENVIADO') AND EXISTS(SELECT 1 FROM "BatchGuide" bg JOIN "BillingGuideItem" gi ON gi."guideId"=bg."guideId" JOIN "ProductionItem" p ON p.id=gi."productionId" WHERE bg."batchId"=bid AND bg.active AND gi.active AND p.state<>CASE WHEN b.state='ENVIADO' THEN 'ENVIADO' ELSE 'FECHADO' END) THEN RAISE EXCEPTION 'Produção não reconcilia com estado do lote' USING ERRCODE='23514'; END IF;
 IF b.state='ENVIADO' AND NOT EXISTS(SELECT 1 FROM "BatchSend" WHERE "batchId"=bid) THEN RAISE EXCEPTION 'Envio manual obrigatório' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "BillingBatch_history" AFTER INSERT OR UPDATE ON "BillingBatch" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION batch_history_required();
CREATE CONSTRAINT TRIGGER "BatchGuide_history" AFTER INSERT OR UPDATE ON "BatchGuide" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION batch_history_required();
CREATE CONSTRAINT TRIGGER "BatchSend_history" AFTER INSERT ON "BatchSend" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION batch_history_required();

-- Expande apenas transições preservadas ligadas ao lote, sem alterar snapshot/preço/consumo.
CREATE OR REPLACE FUNCTION production_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s "TreatmentSession"; c "BeneficiaryCoverage"; p "BillingProcedure"; u "AuthorizationUse"; mode text; t "ProcedureTariff"; reopening boolean=false; sending boolean=false;
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
 IF OLD.state='FECHADO' AND NEW.state IN ('APTO','ENVIADO') THEN
 IF (to_jsonb(NEW)-ARRAY['state','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version']) THEN RAISE EXCEPTION 'Retorno/envio preserva produção fechada' USING ERRCODE='23514'; END IF;
 reopening=NEW.state='APTO' AND EXISTS(SELECT 1 FROM "BatchGuide" bg JOIN "BillingBatch" b ON b.id=bg."batchId" JOIN "BillingGuideItem" gi ON gi."guideId"=bg."guideId" JOIN "BillingGuide" g ON g.id=gi."guideId" WHERE gi."productionId"=NEW.id AND gi.active AND bg.active AND b.state='CANCELADO' AND g.state='EM_LOTE');
 sending=NEW.state='ENVIADO' AND EXISTS(SELECT 1 FROM "BatchGuide" bg JOIN "BillingBatch" b ON b.id=bg."batchId" JOIN "BillingGuideItem" gi ON gi."guideId"=bg."guideId" WHERE gi."productionId"=NEW.id AND gi.active AND bg.active AND b.state='ENVIADO');
 IF NOT reopening AND NOT sending THEN RAISE EXCEPTION 'Transição exige cancelamento/envio do lote' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT reopening AND NOT sending AND OLD.state IN ('FECHADO','ENVIADO') AND (to_jsonb(NEW)-ARRAY['adjustmentPending','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['adjustmentPending','version']) THEN
 RAISE EXCEPTION 'Produção fechada é imutável' USING ERRCODE='23514'; END IF;
 IF OLD."useId" IS NOT NULL AND NEW."useId" IS DISTINCT FROM OLD."useId" AND NOT EXISTS(SELECT 1 FROM "AuthorizationUse" WHERE "reversesId"=OLD."useId") THEN
 RAISE EXCEPTION 'Devolução do consumo obrigatória' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.state IN ('PENDENTE','INVALIDADO') AND NEW."useId" IS NOT NULL THEN RAISE EXCEPTION 'Estado não mantém consumo' USING ERRCODE='23514'; END IF;
 IF NEW.state='APTO' AND NOT reopening THEN
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

CREATE OR REPLACE FUNCTION guide_history_required() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gid text; g "BillingGuide"; links jsonb;
BEGIN
 IF TG_TABLE_NAME='BillingGuide' THEN gid=NEW.id; ELSE gid=NEW."guideId"; END IF;
 SELECT * INTO g FROM "BillingGuide" WHERE id=gid;
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]'::jsonb) INTO links FROM "BillingGuideItem" i WHERE i."guideId"=gid;
 IF NOT EXISTS(SELECT 1 FROM "GuideChange" WHERE "guideId"=gid AND version=g.version AND snapshot->'guide'=to_jsonb(g) AND snapshot->'items'=links) THEN RAISE EXCEPTION 'Histórico completo da guia obrigatório' USING ERRCODE='23514'; END IF;
 IF g.state='APTA' AND (EXISTS(SELECT 1 FROM "BillingGuideItem" i JOIN "ProductionItem" p ON p.id=i."productionId" WHERE i."guideId"=gid AND i.active AND (p.state<>'APTO' OR p."coverageId"<>g."coverageId" OR to_char(p."executionOn",'YYYY-MM')<>g.month OR ((i.snapshot->>'productionVersion')::integer IS DISTINCT FROM p.version AND NOT EXISTS(SELECT 1 FROM "BatchGuide" bg JOIN "BillingBatch" b ON b.id=bg."batchId" WHERE bg."guideId"=g.id AND b.state='CANCELADO' AND bg."closedGuideVersion"=g.version-1)))) OR NOT EXISTS(SELECT 1 FROM "BillingGuideItem" WHERE "guideId"=gid AND active) OR g."totalCents"<>(SELECT coalesce(sum(p."amountCents"),0) FROM "BillingGuideItem" i JOIN "ProductionItem" p ON p.id=i."productionId" WHERE i."guideId"=gid AND i.active)) THEN RAISE EXCEPTION 'Total/itens da guia não reconciliam' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION batch_guide_state_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "BatchGuide" bg JOIN "BillingBatch" b ON b.id=bg."batchId" WHERE bg."guideId"=NEW.id AND bg.active AND b.state IN ('FECHADO','ENVIADO')) AND NEW.state<>'EM_LOTE' THEN RAISE EXCEPTION 'Guia pertence a lote preservado' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "BillingGuide_batch_state" AFTER UPDATE ON "BillingGuide" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION batch_guide_state_required();
