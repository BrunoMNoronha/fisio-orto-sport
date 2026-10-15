-- CreateTable
CREATE TABLE "GuideProfile" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "reference" VARCHAR(300) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "requestId" VARCHAR(36) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuideProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideSequence" (
    "contractId" TEXT NOT NULL,
    "lastNumber" BIGINT NOT NULL,

    CONSTRAINT "GuideSequence_pkey" PRIMARY KEY ("contractId")
);

-- CreateTable
CREATE TABLE "BillingGuide" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "coverageId" TEXT NOT NULL,
    "authorizationId" TEXT,
    "number" BIGINT NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "state" VARCHAR(12) NOT NULL DEFAULT 'RASCUNHO',
    "requesterId" TEXT,
    "requestedOn" DATE,
    "characterCode" VARCHAR(20) NOT NULL DEFAULT '',
    "attendanceCode" VARCHAR(20) NOT NULL DEFAULT '',
    "regimeCode" VARCHAR(20) NOT NULL DEFAULT '',
    "accidentCode" VARCHAR(20) NOT NULL DEFAULT '',
    "clinicalIndication" VARCHAR(1000) NOT NULL DEFAULT '',
    "clinicalConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" JSONB NOT NULL,
    "sourceDigest" VARCHAR(64) NOT NULL,
    "pending" JSONB NOT NULL,
    "totalCents" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingGuideItem" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "BillingGuideItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideChange" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "requestId" VARCHAR(36) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuideChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuideProfile_requestId_key" ON "GuideProfile"("requestId");

-- CreateIndex
CREATE INDEX "GuideProfile_actorId_idx" ON "GuideProfile"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "GuideProfile_contractId_version_key" ON "GuideProfile"("contractId", "version");

-- CreateIndex
CREATE INDEX "BillingGuide_state_createdAt_id_idx" ON "BillingGuide"("state", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BillingGuide_contractId_number_key" ON "BillingGuide"("contractId", "number");

-- CreateIndex
CREATE INDEX "BillingGuideItem_guideId_idx" ON "BillingGuideItem"("guideId");

-- CreateIndex
CREATE INDEX "BillingGuideItem_productionId_idx" ON "BillingGuideItem"("productionId");

-- CreateIndex
CREATE UNIQUE INDEX "GuideChange_requestId_key" ON "GuideChange"("requestId");

-- CreateIndex
CREATE INDEX "GuideChange_actorId_idx" ON "GuideChange"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "GuideChange_guideId_version_key" ON "GuideChange"("guideId", "version");

-- AddForeignKey
ALTER TABLE "GuideProfile" ADD CONSTRAINT "GuideProfile_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OperatorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideProfile" ADD CONSTRAINT "GuideProfile_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideSequence" ADD CONSTRAINT "GuideSequence_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OperatorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingGuide" ADD CONSTRAINT "BillingGuide_coverageId_contractId_fkey" FOREIGN KEY ("coverageId", "contractId") REFERENCES "BeneficiaryCoverage"("id", "contractId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingGuide" ADD CONSTRAINT "BillingGuide_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "OperatorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingGuide" ADD CONSTRAINT "BillingGuide_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "BenefitAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingGuide" ADD CONSTRAINT "BillingGuide_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "BillingProfessional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingGuideItem" ADD CONSTRAINT "BillingGuideItem_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "BillingGuide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingGuideItem" ADD CONSTRAINT "BillingGuideItem_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "ProductionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideChange" ADD CONSTRAINT "GuideChange_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "BillingGuide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideChange" ADD CONSTRAINT "GuideChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuideSequence" ADD CHECK ("lastNumber">0);
ALTER TABLE "GuideProfile" ADD CHECK(version>0 AND length(btrim(reference))>0 AND length(btrim(reason))>0 AND jsonb_typeof(rules)='object');
ALTER TABLE "BillingGuide" ADD CHECK(number>0 AND version>0 AND "totalCents">=0 AND month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND state IN ('RASCUNHO','APTA','EM_LOTE','CANCELADA'));
ALTER TABLE "GuideChange" ADD CHECK(version>0 AND length(btrim(reason))>0 AND fingerprint ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX "BillingGuideItem_active_production" ON "BillingGuideItem"("productionId") WHERE active;
CREATE TRIGGER "GuideProfile_immutable" BEFORE UPDATE OR DELETE ON "GuideProfile" FOR EACH ROW EXECUTE FUNCTION beneficiary_append_only();
CREATE TRIGGER "GuideChange_immutable" BEFORE UPDATE OR DELETE ON "GuideChange" FOR EACH ROW EXECUTE FUNCTION beneficiary_append_only();
CREATE FUNCTION guide_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "BenefitAuthorization";
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Guia preservada' USING ERRCODE='23514'; END IF;
 IF NEW."authorizationId" IS NOT NULL THEN
 SELECT * INTO a FROM "BenefitAuthorization" WHERE id=NEW."authorizationId";
 IF a."coverageId" IS DISTINCT FROM NEW."coverageId" OR a."contractId" IS DISTINCT FROM NEW."contractId" THEN RAISE EXCEPTION 'Autorização incompatível com guia' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='INSERT' AND NEW.state<>'RASCUNHO' THEN RAISE EXCEPTION 'Guia inicia em rascunho' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
 IF (NEW.version<>OLD.version+1 AND NOT (NEW.version=OLD.version AND OLD.state='RASCUNHO' AND NOT EXISTS(SELECT 1 FROM "GuideChange" WHERE "guideId"=OLD.id AND version=OLD.version))) OR (to_jsonb(NEW)-ARRAY['state','requesterId','requestedOn','characterCode','attendanceCode','regimeCode','accidentCode','clinicalIndication','clinicalConfirmed','snapshot','sourceDigest','pending','totalCents','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','requesterId','requestedOn','characterCode','attendanceCode','regimeCode','accidentCode','clinicalIndication','clinicalConfirmed','snapshot','sourceDigest','pending','totalCents','version']) THEN RAISE EXCEPTION 'Identidade/versão de guia inválida' USING ERRCODE='23514'; END IF;
 IF OLD.state='APTA' AND NEW.state='APTA' THEN RAISE EXCEPTION 'Devolva guia para correção' USING ERRCODE='23514'; END IF;
 IF OLD.state='CANCELADA' THEN RAISE EXCEPTION 'Guia cancelada preservada' USING ERRCODE='23514'; END IF;
 IF OLD.state='EM_LOTE' AND (NEW.state<>'APTA' OR (to_jsonb(NEW)-ARRAY['state','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version'])) THEN RAISE EXCEPTION 'Guia em lote preservada' USING ERRCODE='23514'; END IF;
 IF NEW.state='EM_LOTE' AND (OLD.state<>'APTA' OR (to_jsonb(NEW)-ARRAY['state','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version'])) THEN RAISE EXCEPTION 'Lote exige guia apta preservada' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.state='APTA' AND (NEW.pending<>'[]'::jsonb OR NEW."totalCents"<=0 OR NEW."sourceDigest" !~ '^[0-9a-f]{64}$' OR NEW.snapshot='{}'::jsonb) THEN RAISE EXCEPTION 'Guia incompleta não fica apta' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "BillingGuide_guard" BEFORE INSERT OR UPDATE OR DELETE ON "BillingGuide" FOR EACH ROW EXECUTE FUNCTION guide_guard();
CREATE FUNCTION guide_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g "BillingGuide"; p "ProductionItem"; a text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Origem de guia preservada' USING ERRCODE='23514'; END IF;
 SELECT * INTO g FROM "BillingGuide" WHERE id=NEW."guideId" FOR UPDATE;
 SELECT * INTO p FROM "ProductionItem" WHERE id=NEW."productionId";
 IF TG_OP='UPDATE' AND (NOT OLD.active OR NEW.id<>OLD.id OR NEW."guideId"<>OLD."guideId" OR NEW."productionId"<>OLD."productionId") THEN RAISE EXCEPTION 'Vínculo de guia preservado' USING ERRCODE='23514'; END IF;
 IF g.state='EM_LOTE' OR (g.state='CANCELADA' AND NEW.active) OR (g.state='APTA' AND TG_OP='UPDATE') THEN RAISE EXCEPTION 'Devolva guia antes de editar itens' USING ERRCODE='23514'; END IF;
 IF NEW.active AND TG_OP='INSERT' THEN
 SELECT i."authorizationId" INTO a FROM "AuthorizationUse" u JOIN "AuthorizationItem" i ON i.id=u."itemId" WHERE u.id=p."useId";
 IF p.state<>'APTO' OR p."coverageId"<>g."coverageId" OR to_char(p."executionOn",'YYYY-MM')<>g.month OR a IS DISTINCT FROM g."authorizationId" THEN RAISE EXCEPTION 'Produção incompatível com agrupamento da guia' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "BillingGuideItem_guard" BEFORE INSERT OR UPDATE OR DELETE ON "BillingGuideItem" FOR EACH ROW EXECUTE FUNCTION guide_item_guard();
CREATE FUNCTION guide_history_required() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gid text; g "BillingGuide"; links jsonb;
BEGIN
 IF TG_TABLE_NAME='BillingGuide' THEN gid=NEW.id; ELSE gid=NEW."guideId"; END IF;
 SELECT * INTO g FROM "BillingGuide" WHERE id=gid;
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]'::jsonb) INTO links FROM "BillingGuideItem" i WHERE i."guideId"=gid;
 IF NOT EXISTS(SELECT 1 FROM "GuideChange" WHERE "guideId"=gid AND version=g.version AND snapshot->'guide'=to_jsonb(g) AND snapshot->'items'=links) THEN RAISE EXCEPTION 'Histórico completo da guia obrigatório' USING ERRCODE='23514'; END IF;
 IF g.state='APTA' AND (EXISTS(SELECT 1 FROM "BillingGuideItem" i JOIN "ProductionItem" p ON p.id=i."productionId" WHERE i."guideId"=gid AND i.active AND (p.state<>'APTO' OR p."coverageId"<>g."coverageId" OR to_char(p."executionOn",'YYYY-MM')<>g.month OR (i.snapshot->>'productionVersion')::integer IS DISTINCT FROM p.version)) OR NOT EXISTS(SELECT 1 FROM "BillingGuideItem" WHERE "guideId"=gid AND active) OR g."totalCents"<>(SELECT coalesce(sum(p."amountCents"),0) FROM "BillingGuideItem" i JOIN "ProductionItem" p ON p.id=i."productionId" WHERE i."guideId"=gid AND i.active)) THEN RAISE EXCEPTION 'Total/itens da guia não reconciliam' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "BillingGuide_history" AFTER INSERT OR UPDATE ON "BillingGuide" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guide_history_required();
CREATE CONSTRAINT TRIGGER "BillingGuideItem_history" AFTER INSERT OR UPDATE ON "BillingGuideItem" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guide_history_required();
